(function ($) {
  "use strict";

  var DOC_PAGES = [
    "index.html",
    "plugins.html",
    "themes.html",
    "engines.html",
    "store.html",
    "aliases.html",
    "env.html",
    "styling.html",
    "contributing.html",
  ];

  var searchDebounceTimer = null;
  var crossDocRequestId = 0;

  function getMainText(html) {
    var m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (!m) return "";
    return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function getTitle(html) {
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return "";
    return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function makeSnippet(text, qLower, contextLen) {
    if (!text || !qLower) return "";
    var idx = text.toLowerCase().indexOf(qLower);
    if (idx === -1) return "";
    contextLen = contextLen || 50;
    var start = Math.max(0, idx - contextLen);
    var end = Math.min(text.length, idx + qLower.length + contextLen);
    var before = (start > 0 ? "\u2026" : "") + text.slice(start, idx);
    var match = text.slice(idx, idx + qLower.length);
    var after = text.slice(idx + qLower.length, end) + (end < text.length ? "\u2026" : "");
    return (
      escapeHtml(before) +
      "<mark>" + escapeHtml(match) + "</mark>" +
      escapeHtml(after)
    );
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function clearHighlights($container) {
    $container.find("mark").each(function () {
      var $m = $(this);
      $m.replaceWith($m.text());
    });
  }

  function highlightInNode($node, term) {
    var count = 0;
    var textNodes = [];
    $node.contents().each(function () {
      if (this.nodeType === 3) {
        textNodes.push(this);
      } else if (this.nodeType === 1 && this.childNodes.length) {
        count += highlightInNode($(this), term);
      }
    });
    textNodes.forEach(function (tn) {
      var text = tn.textContent;
      var idx = text.toLowerCase().indexOf(term);
      if (idx === -1) return;
      count += 1;
      var before = text.slice(0, idx);
      var match = text.slice(idx, idx + term.length);
      var after = text.slice(idx + term.length);
      var mark = document.createElement("mark");
      mark.textContent = match;
      var parent = tn.parentNode;
      parent.insertBefore(document.createTextNode(before), tn);
      parent.insertBefore(mark, tn);
      parent.insertBefore(document.createTextNode(after), tn);
      parent.removeChild(tn);
    });
    return count;
  }

  function runInPageSearch(q) {
    var $main = $("main");
    var $input = $("#doc-search-input");
    var $countEl = $(".doc-search-count");
    var $clearBtn = $(".doc-search-clear");
    if (!$main.length || !$input.length) return;

    clearHighlights($main);
    if ($main[0]) $main[0].normalize();
    $countEl.text("");
    $clearBtn.toggle(!!q);

    if (!q) {
      return;
    }

    var total = highlightInNode($main, q);
    $countEl.text(total > 0 ? total + " match" + (total !== 1 ? "es" : "") : "No matches");
  }

  function showCrossDocResults(results, q) {
    var $drop = $(".doc-search-results");
    if (!results.length) {
      $drop.hide().empty();
      return;
    }
    var pathParts = window.location.pathname.split("/").filter(Boolean);
    var currentPage = pathParts.length ? pathParts[pathParts.length - 1] : "index.html";
    var html = '<ul class="doc-search-results-list">';
    results.forEach(function (r) {
      if (r.url === currentPage) return;
      var url = r.url + (q ? "?q=" + encodeURIComponent(q) : "");
      html += '<li><a href="' + escapeHtml(url) + '">';
      html += '<span class="doc-search-result-title">' + escapeHtml(r.title) + "</span>";
      if (r.snippet) {
        html += '<span class="doc-search-snippet">' + r.snippet + "</span>";
      }
      html += "</a></li>";
    });
    html += "</ul>";
    $drop.html(html).show();
  }

  function runCrossDocSearch(q) {
    var $drop = $(".doc-search-results");
    if (!q || q.length < 2) {
      $drop.hide().empty();
      return;
    }
    crossDocRequestId += 1;
    var thisId = crossDocRequestId;
    $drop.html('<span class="doc-search-results-loading">Searching…</span>').show();

    var qLower = q.toLowerCase();
    var results = [];
    var pending = DOC_PAGES.length;
    var done = function () {
      pending -= 1;
      if (pending === 0 && thisId === crossDocRequestId) {
        showCrossDocResults(results, q);
      }
    };

    DOC_PAGES.forEach(function (file) {
      $.ajax({ url: file, dataType: "text" })
        .done(function (html) {
          var text = getMainText(html);
          if (text.toLowerCase().indexOf(qLower) !== -1) {
            results.push({
              url: file,
              title: getTitle(html) || file,
              snippet: makeSnippet(text, qLower, 45),
            });
          }
        })
        .always(done);
    });
  }

  function debouncedCrossDocSearch() {
    var q = ($("#doc-search-input").val() || "").trim();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function () {
      searchDebounceTimer = null;
      runCrossDocSearch(q);
    }, 300);
  }

  function initSearch() {
    var $main = $("main");
    var $input = $("#doc-search-input");
    if (!$main.length || !$input.length) return;

    var $wrap = $input.closest(".doc-search-wrap");
    if (!$wrap.length) return;

    if (!$wrap.find(".doc-search-results").length) {
      $wrap.append('<div class="doc-search-results" style="display:none"></div>');
    }

    var $clearBtn = $(".doc-search-clear");

    $input.on("input", function () {
      var q = ($input.val() || "").trim();
      runInPageSearch(q.toLowerCase());
      debouncedCrossDocSearch();
    });

    $input.on("keydown", function (e) {
      if (e.key === "Escape") {
        $input.val("").blur();
        runInPageSearch("");
        $(".doc-search-results").hide().empty();
      }
    });

    $clearBtn.on("click", function () {
      $input.val("").focus();
      runInPageSearch("");
      $(".doc-search-results").hide().empty();
    });

    $(document).on("keydown", function (e) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !$input.is(e.target)) {
        var target = e.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        e.preventDefault();
        $input.focus();
      }
    });

    $(document).on("click", function (e) {
      if (!$(e.target).closest(".doc-search-wrap").length) {
        $(".doc-search-results").hide();
      }
    });

    var params = new URLSearchParams(window.location.search);
    var initialQ = params.get("q");
    if (initialQ) {
      $input.val(initialQ);
      runInPageSearch(initialQ.toLowerCase());
      runCrossDocSearch(initialQ);
      var $firstMark = $main.find("mark").first();
      if ($firstMark.length) {
        $firstMark[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  $(function () {
    initSearch();
  });
})(window.jQuery || window.$);
