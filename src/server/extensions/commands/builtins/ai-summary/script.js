(function () {
  const glanceEl = document.getElementById("at-a-glance");
  if (!glanceEl) return;

  /** @type {{ role: string; content: string }[]} */
  let history = [];

  function getQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  }

  function buildResultsContext() {
    const items = document.querySelectorAll("#results-list .result-item");
    const out = [];
    let i = 0;
    for (const el of items) {
      if (i >= 6) break;
      const title =
        el.querySelector(".result-title")?.textContent?.trim() || "";
      const snippet =
        el.querySelector(".result-snippet")?.textContent?.trim() || "";
      if (title || snippet) {
        i++;
        out.push("[" + i + "] " + title + "\n" + snippet);
      }
    }
    return out.join("\n\n");
  }

  const _renderMarkdown = (md) => {
    const esc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    let html = esc(md);
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) => "<pre><code>" + code.trimEnd() + "</code></pre>",
    );
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/^(\s*)[*-] (.+)$/gm, "$1<li>$2</li>");
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
    html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, (m) =>
      m.startsWith("<ul>") ? m : "<ol>" + m + "</ol>",
    );
    html = html.replace(/\n{2,}/g, "</p><p>");
    html = "<p>" + html + "</p>";
    html = html.replace(/<p>\s*(<pre>|<ul>|<ol>)/g, "$1");
    html = html.replace(/(<\/pre>|<\/ul>|<\/ol>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*<\/p>/g, "");
    return html;
  };

  function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  function handleSetup(box) {
    const diveBtn = box.querySelector(".glance-ai-dive");
    const chatWrap = box.querySelector(".glance-ai-chat");
    const input = box.querySelector(".glance-ai-input");
    const messagesEl = box.querySelector(".glance-ai-messages");
    if (!diveBtn || !chatWrap || !input || !messagesEl) return;

    const snippet = box.querySelector(".glance-snippet");
    const query = getQuery();
    const context = buildResultsContext();

    history = [
      {
        role: "system",
        content:
          "You are a helpful assistant. The user searched for: " +
          JSON.stringify(query) +
          ". Here are the search results for context:\n\n" +
          context +
          "\n\nYou already gave a summary. Now the user wants to dive deeper. Answer their follow-up questions conversationally and concisely.",
      },
      {
        role: "assistant",
        content: snippet ? snippet.textContent || "" : "",
      },
    ];

    diveBtn.addEventListener("click", function () {
      diveBtn.hidden = true;
      chatWrap.hidden = false;
      input.focus();
    });

    input.addEventListener("input", function () {
      autoResize(input);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input, messagesEl, chatWrap);
      }
    });
  }

  async function sendMessage(input, messagesEl) {
    const text = input.value.trim();
    if (!text) return;

    const userDiv = document.createElement("div");
    userDiv.className = "glance-ai-reply glance-ai-user";
    userDiv.textContent = text;
    messagesEl.appendChild(userDiv);

    history.push({ role: "user", content: text });
    input.value = "";
    autoResize(input);

    const typingDiv = document.createElement("div");
    typingDiv.className = "glance-ai-typing";
    typingDiv.textContent = t("ai-summary.thinking");
    messagesEl.appendChild(typingDiv);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      typingDiv.remove();

      if (data.reply) {
        history.push({ role: "assistant", content: data.reply });
        const replyDiv = document.createElement("div");
        replyDiv.className = "glance-ai-reply";
        replyDiv.innerHTML = _renderMarkdown(data.reply);
        messagesEl.appendChild(replyDiv);
      } else {
        const errDiv = document.createElement("div");
        errDiv.className = "glance-ai-typing";
        errDiv.textContent = t("ai-summary.no-response");
        messagesEl.appendChild(errDiv);
      }
    } catch {
      typingDiv.remove();
      const errDiv = document.createElement("div");
      errDiv.className = "glance-ai-typing";
      errDiv.textContent = t("ai-summary.request-failed");
      messagesEl.appendChild(errDiv);
    }

    input.focus();
  }

  const observer = new MutationObserver(function () {
    const box = glanceEl.querySelector(".glance-ai");
    if (box && !box.dataset.chatInit) {
      box.dataset.chatInit = "1";
      handleSetup(box);
    }
  });
  observer.observe(glanceEl, { childList: true, subtree: true });

  const existing = glanceEl.querySelector(".glance-ai");
  if (existing && !existing.dataset.chatInit) {
    existing.dataset.chatInit = "1";
    handleSetup(existing);
  }
})();
