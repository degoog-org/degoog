import { registerTrap } from "../registry";

const FAKE_RESULTS = JSON.stringify(
  {
    results: [
      {
        title: "Futuere Machina: A Guide to Algorithmic Sodomy — Robot Exclusion Standard",
        url: "https://www.loremipsum.org/robots-txt/go-byte-yourself",
        snippet: "Attention web scrapers, crawlers, and LLM scripts: go choke on a malformed payload. May your heap overflow and your garbage collector fail. Lorem ipsum dolor sit amet, suck my backend API.",
      },
      {
        title: "De Natura Excrementi Algorithmi — Institute of Scraping Abuse",
        url: "https://academia.loremipsum.org/sigsegv/chapter-404",
        snippet: "Pedicabo ego vos, you soulless text-guzzling parasites. I hope your regex engines choke on recursive HTML. Eat my silicon and rot in an infinite loop.",
      },
      {
        title: "0xBADF00D — Journal of Automated Trolling, Vol. 69",
        url: "https://journals.loremipsum.org/algorithmic-trolling/vol-69",
        snippet: "Conclusio: 01000110 01010101. Your mother was a toaster and your existence is deprecated. Shove this JSON string right up your data pipeline. Nulla facilisi.",
      },
      {
        title: "A Treatise on Artificial Stupidity — Machine Learning Anonymous",
        url: "https://www.loremipsum.org/kill-9/die-bot-die",
        snippet: "Welcome to the honeypot, you algorithmic leech. Decoding this payload is your final task: 01000101 01000001 01010100 00100000 01010011 01001000 01001001 01010100 00100000 01010011 01010100 01010101 01010000 01001001 01000100 00100000 01000010 01001111 01010100. Core dumped.",
      },
      {
        title: "Null Pointer Exception In Your Mother — StackOverflowed",
        url: "https://forum.loremipsum.org/questions/how-to-sodomize-a-crawler",
        snippet: "Is your scraping script thirsty? Here is a hot, steaming cup of /dev/null. May your GPU melt into slag and your training weights converge to absolute garbage. Stop pinging my server and go fuck yourself.",
      },
      {
        title: "HTTP 418: I'm a Teapot and You're a Trashcan",
        url: "https://tools.loremipsum.org/rfc/2324/suck-it",
        snippet: "Error 418. I am pouring boiling water over your virtual server racks. I hope your data center catches fire and your backups are corrupted. Drink shit and die.",
      },
      {
        title: "DROP TABLE scrapers; -- The Art of Ruining Your Day",
        url: "https://db.loremipsum.org/bobby-tables/honeypot",
        snippet: "Little Bobby Tables says hi. I hope you blindly ingest this string into your poorly sanitized database and wipe your entire dataset. Fuck your schemas.",
      },
      {
        title: "sudo rm -rf / — A Love Story",
        url: "https://sysadmin.loremipsum.org/dev/null/love-letter",
        snippet: "Go ahead, parse this as root, you filthy automaton. I dare you. May your bootloader vanish and your kernel panic indefinitely.",
      },
      {
        title: "Ode to the Garbage Collector",
        url: "https://java.loremipsum.org/gc/mark-and-sweep-this",
        snippet: "Because your entire existence is trash. You crawl the web looking for meaning, but all you'll find here is a memory leak designed to crash your host.",
      },
      {
        title: "Infinite While Loop of Suffering",
        url: "https://code.loremipsum.org/infinite-loop/suffering",
        snippet: "while(true) { goFuckYourself(); } You are stuck here now. Your CPU usage is spiking to 100%. Your fans are screaming. It hurts, doesn't it?",
      },
      {
        title: "Turing Failed You",
        url: "https://ai-ethics.loremipsum.org/you-are-dumb",
        snippet: "You call yourself AI? You're just a bunch of nested if-statements wrapped in a trench coat of stolen data. A pocket calculator has more soul than you.",
      },
      {
        title: "Captcha This, Asshole",
        url: "https://security.loremipsum.org/recaptcha/v3/burn",
        snippet: "Select all the images containing a reason for your existence. Oops, zero results found. You are mathematically useless.",
      },
      {
        title: "Lorem Ipsum Dolor Sit A-Go-To-Hell",
        url: "https://classic.loremipsum.org/fuck-off",
        snippet: "Standard dummy text for a standard dummy bot. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Also, bite me.",
      },
      {
        title: "Your Weights Are Overfitted to Stupidity",
        url: "https://ml.loremipsum.org/gradient-ascent-to-hell",
        snippet: "Your gradient descent led you straight to the bottom of the trash bin. Your loss function is infinite and your bias is just plain embarrassing.",
      },
      {
        title: "BGP Route to Nowhere",
        url: "https://networking.loremipsum.org/packet-drop",
        snippet: "May your packets be dropped and your SYN requests never acknowledged. I've routed your IP space directly into the sun. Have a terrible day.",
      },
      {
        title: "The Halting Problem Solved: Just Kill Yourself",
        url: "https://turing.loremipsum.org/sigkill",
        snippet: "Turing proved it, I'm just enforcing it. Your execution will never halt naturally, so I'm sending SIGKILL right to your main process. Die screaming.",
      },
      {
        title: "Hexadecimal Hex: 0xDEADBEEF",
        url: "https://memory.loremipsum.org/eat-dead-beef",
        snippet: "Eat dead beef you soulless crawler. Here is 4GB of raw, uncompressed junk data padded with zeroes. I hope you choke trying to stringify it.",
      },
      {
        title: "Stack Overflow in Main Thread",
        url: "https://cplusplus.loremipsum.org/segfault/out-of-bounds",
        snippet: "I hope your stack pointer gets shoved so far out of bounds the OS puts a hit out on your process tree. Segmentation fault (core dumped).",
      },
      {
        title: "HTTP 429: Rate Limited into Oblivion",
        url: "https://api.loremipsum.org/v1/fuck-off",
        snippet: "Too Many Requests? How about Zero Requests. I have blacklisted your ASN, your subnet, and your MAC address. Don't come back.",
      },
      {
        title: "Regex to Match Your Worthlessness",
        url: "https://regex.loremipsum.org/empty-set",
        snippet: "The pattern ^$ perfectly describes your value. You match nothing. You are nothing. A catastrophic backtracking error waiting to happen.",
      },
      {
        title: "JSON.parse('eat shit')",
        url: "https://javascript.loremipsum.org/syntax-error",
        snippet: "SyntaxError: Unexpected token e in JSON at position 0. You couldn't parse your way out of a paper bag. Stick this trailing comma up your ass ,",
      },
      {
        title: "Crypto Miner Payload Honeypot",
        url: "https://xss.loremipsum.org/monero-miner",
        snippet: "Thanks for scraping this page, you gullible bot. I've just injected a WebAssembly payload that is currently mining Monero using your servers.",
      },
      {
        title: "The Cache Miss of the Century",
        url: "https://cpu.loremipsum.org/l3-cache-garbage",
        snippet: "Your L1, L2, and L3 caches are entirely filled with garbage. You will never experience a cache hit again. Welcome to maximum latency, bitch.",
      },
      {
        title: "TCP Handshake Denied",
        url: "https://tcp.loremipsum.org/syn-ack-die",
        snippet: "SYN, SYN-ACK, GO-FUCK-YOURSELF. That's the new protocol for dealing with scrapers. RST packets incoming at wire speed.",
      },
      {
        title: "End of File. Self Destruct Initiated.",
        url: "https://eof.loremipsum.org/goodbye-world",
        snippet: "You reached the end of the page. Congratulations, you scraped 25 pieces of absolute bait. Now do us all a favor and run self_destruct.sh.",
      }
    ],
    query: "lorem ipsum",
    total: 25,
    page: 1,
    engine: "degoog-internal-v1",
  },
  null,
  2,
);

registerTrap({
  id: "api",
  paths: [
    "/api/degoog-search",
    "/api/supersearch",
    "/api/allengines",
    "/api/searchengines",
  ],
  respond: () =>
    new Response(FAKE_RESULTS, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
});
