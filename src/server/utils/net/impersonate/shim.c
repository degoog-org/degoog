/*
 * @fccview here
 *
 * FUCKING HELL last time I wrote C I was 14, in high school.
 * If you are extremely confused by why there are a couple of C files in the repo...
 * I won't pretend all of this came out of my big brain, there's some heavy AI suggestions here, however it does make sense.
 *
 * current curl-impersonate binaries start a new process for every request. So a brand new
 * connection and TLS handshakes every single time. Real browsers don't behave that way, so big G realises real quick
 * that we're up to no good. It get infinitely worse behind rotating proxies as every request leaves from a different IP.
 *
 * So good old claudia thought that talking to libcurl-impersonate directly and keeping connections open per proxy would let a
 * search reuses one connection and one exit IP like a browser would.
 *
 * Here's the kicker... libcurl's option functions take a variable number of arguments, and Bun's FFI can't call
 * those properly on macos (and I suck and develop on my macbook - and frankly some people may use mac mini nowadays to run their own local AIs).
 * 
 * This file makes those calls for the TypeScript side and buffers the
 * responses. Bun SHOULD compile it on startup with its own compiler (honestly what does Bun not do these days, good old vibecoders huh), 
 * so you don't need gcc or anything installed.
 *
 * The library is optional, if you don't use it degoog will fall back to the old libraries like it always did.
 * We'll see if it works long term but my testing are VERY promising.
 */

typedef unsigned long size_t;
typedef void CURL;
typedef void CURLM;
typedef void CURLSH;

struct curl_slist {
  char *data;
  struct curl_slist *next;
};

typedef struct {
  int msg;
  CURL *easy_handle;
  union {
    void *whatever;
    int result;
  } data;
} CURLMsg;

void *calloc(size_t, size_t);
void *realloc(void *, size_t);
void free(void *);
void *memcpy(void *, const void *, size_t);
int memcmp(const void *, const void *, size_t);
size_t strlen(const char *);

int curl_global_init(long);
CURL *curl_easy_init(void);
void curl_easy_cleanup(CURL *);
int curl_easy_setopt(CURL *, int, ...);
int curl_easy_getinfo(CURL *, int, ...);
int curl_easy_impersonate(CURL *, const char *, int);
const char *curl_easy_strerror(int);
CURLM *curl_multi_init(void);
int curl_multi_add_handle(CURLM *, CURL *);
int curl_multi_remove_handle(CURLM *, CURL *);
int curl_multi_perform(CURLM *, int *);
int curl_multi_poll(CURLM *, void *, unsigned int, int, int *);
CURLMsg *curl_multi_info_read(CURLM *, int *);
CURLSH *curl_share_init(void);
int curl_share_setopt(CURLSH *, int, ...);
int curl_share_cleanup(CURLSH *);
struct curl_slist *curl_slist_append(struct curl_slist *, const char *);
void curl_slist_free_all(struct curl_slist *);

#define OPT_WRITEDATA 10001
#define OPT_URL 10002
#define OPT_PROXY 10004
#define OPT_POSTFIELDSIZE 60
#define OPT_HTTPHEADER 10023
#define OPT_COOKIEFILE 10031
#define OPT_CUSTOMREQUEST 10036
#define OPT_HEADERDATA 10029
#define OPT_FOLLOWLOCATION 52
#define OPT_MAXREDIRS 68
#define OPT_NOSIGNAL 99
#define OPT_WRITEFUNCTION 20011
#define OPT_HEADERFUNCTION 20079
#define OPT_SHARE 10100
#define OPT_COOKIELIST 10135
#define OPT_TIMEOUT_MS 155
#define OPT_CONNECTTIMEOUT_MS 156
#define OPT_COPYPOSTFIELDS 10165
#define OPT_MAXAGE_CONN 288
#define OPT_PRIVATE 10103
#define INFO_EFFECTIVE_URL 0x100001
#define INFO_RESPONSE_CODE 0x200002
#define INFO_PRIVATE 0x100015
#define INFO_COOKIELIST 0x40001c
#define SHOPT_SHARE 1
#define LOCK_DNS 3
#define LOCK_SSL_SESSION 4
#define LOCK_CONNECT 5
#define MSG_DONE 1

typedef struct {
  char *body;
  size_t body_len;
  char *head;
  size_t head_len;
  size_t limit;
  int over;
  struct curl_slist *headers;
  CURL *easy;
  int result;
  int done;
} Transfer;

static size_t on_body(char *data, size_t size, size_t count, void *user) {
  Transfer *t = (Transfer *)user;
  size_t len = size * count;
  if (t->body_len + len > t->limit) {
    t->over = 1;
    return 0;
  }
  char *grown = (char *)realloc(t->body, t->body_len + len + 1);
  if (!grown) return 0;
  t->body = grown;
  memcpy(t->body + t->body_len, data, len);
  t->body_len += len;
  return len;
}

static size_t on_header(char *data, size_t size, size_t count, void *user) {
  Transfer *t = (Transfer *)user;
  size_t len = size * count;
  if (len >= 5 && memcmp(data, "HTTP/", 5) == 0) t->head_len = 0;
  char *grown = (char *)realloc(t->head, t->head_len + len + 1);
  if (!grown) return 0;
  t->head = grown;
  memcpy(t->head + t->head_len, data, len);
  t->head_len += len;
  return len;
}

int ci_init(void) { return curl_global_init(3); }

const char *ci_strerror(int code) { return curl_easy_strerror(code); }

CURLSH *ci_share_new(void) {
  CURLSH *share = curl_share_init();
  if (!share) return 0;
  curl_share_setopt(share, SHOPT_SHARE, LOCK_DNS);
  curl_share_setopt(share, SHOPT_SHARE, LOCK_SSL_SESSION);
  curl_share_setopt(share, SHOPT_SHARE, LOCK_CONNECT);
  return share;
}

int ci_share_free(CURLSH *share) { return curl_share_cleanup(share); }

CURLM *ci_multi_new(void) { return curl_multi_init(); }

Transfer *ci_transfer_new(int limit) {
  Transfer *t = (Transfer *)calloc(1, sizeof(Transfer));
  if (t) t->limit = (size_t)limit;
  return t;
}

CURL *ci_easy_new(const char *target, int default_headers, CURLSH *share, Transfer *t) {
  CURL *h = curl_easy_init();
  if (!h) return 0;
  if (curl_easy_impersonate(h, target, default_headers) != 0) {
    curl_easy_cleanup(h);
    return 0;
  }
  curl_easy_setopt(h, OPT_NOSIGNAL, 1L);
  curl_easy_setopt(h, OPT_SHARE, share);
  curl_easy_setopt(h, OPT_COOKIEFILE, "");
  curl_easy_setopt(h, OPT_MAXAGE_CONN, 60L);
  curl_easy_setopt(h, OPT_WRITEFUNCTION, on_body);
  curl_easy_setopt(h, OPT_WRITEDATA, t);
  curl_easy_setopt(h, OPT_HEADERFUNCTION, on_header);
  curl_easy_setopt(h, OPT_HEADERDATA, t);
  curl_easy_setopt(h, OPT_PRIVATE, t);
  t->easy = h;
  return h;
}

int ci_set_str(CURL *h, int opt, const char *value) { return curl_easy_setopt(h, opt, value); }

int ci_set_long(CURL *h, int opt, long value) { return curl_easy_setopt(h, opt, value); }

int ci_set_body(CURL *h, const char *body, int len) {
  if (len == 0) return curl_easy_setopt(h, OPT_POSTFIELDSIZE, 0L);
  curl_easy_setopt(h, OPT_POSTFIELDSIZE, (long)len);
  return curl_easy_setopt(h, OPT_COPYPOSTFIELDS, body);
}

int ci_add_header(CURL *h, Transfer *t, const char *line) {
  struct curl_slist *next = curl_slist_append(t->headers, line);
  if (!next) return 1;
  t->headers = next;
  return curl_easy_setopt(h, OPT_HTTPHEADER, t->headers);
}

int ci_add_cookie(CURL *h, const char *line) { return curl_easy_setopt(h, OPT_COOKIELIST, line); }

int ci_start(CURLM *m, CURL *h) { return curl_multi_add_handle(m, h); }

int ci_step(CURLM *m, int wait_ms) {
  int running = 0;
  curl_multi_perform(m, &running);
  if (running > 0 && wait_ms > 0) {
    curl_multi_poll(m, 0, 0, wait_ms, 0);
    curl_multi_perform(m, &running);
  }
  return running;
}

Transfer *ci_next_done(CURLM *m) {
  int left = 0;
  CURLMsg *msg;
  while ((msg = curl_multi_info_read(m, &left))) {
    if (msg->msg != MSG_DONE) continue;
    Transfer *t = 0;
    curl_easy_getinfo(msg->easy_handle, INFO_PRIVATE, &t);
    if (!t) continue;
    t->result = msg->data.result;
    t->done = 1;
    return t;
  }
  return 0;
}

int ci_status(CURL *h) {
  long code = 0;
  curl_easy_getinfo(h, INFO_RESPONSE_CODE, &code);
  return (int)code;
}

const char *ci_effective_url(CURL *h) {
  char *url = 0;
  curl_easy_getinfo(h, INFO_EFFECTIVE_URL, &url);
  return url;
}

char *ci_cookies(CURL *h) {
  struct curl_slist *list = 0;
  curl_easy_getinfo(h, INFO_COOKIELIST, &list);
  size_t total = 0;
  for (struct curl_slist *item = list; item; item = item->next) total += strlen(item->data) + 1;
  char *out = (char *)calloc(total + 1, 1);
  if (out) {
    size_t pos = 0;
    for (struct curl_slist *item = list; item; item = item->next) {
      size_t len = strlen(item->data);
      memcpy(out + pos, item->data, len);
      pos += len;
      out[pos++] = '\n';
    }
  }
  curl_slist_free_all(list);
  return out;
}

CURL *ci_easy(Transfer *t) { return t->easy; }
int ci_result(Transfer *t) { return t->result; }
int ci_over(Transfer *t) { return t->over; }
char *ci_body(Transfer *t) { return t->body; }
int ci_body_len(Transfer *t) { return (int)t->body_len; }
char *ci_head(Transfer *t) { return t->head; }
int ci_head_len(Transfer *t) { return (int)t->head_len; }

void ci_finish(CURLM *m, CURL *h, Transfer *t) {
  if (h) {
    curl_multi_remove_handle(m, h);
    curl_easy_cleanup(h);
  }
  if (t) {
    curl_slist_free_all(t->headers);
    free(t->body);
    free(t->head);
    free(t);
  }
}

void ci_free(void *p) { free(p); }
