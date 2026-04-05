(function () {
  var namespaces = window.__DEGOOG_T__ || {};

  /**
   * Creates a translator function from a translations object.
   * @param {object} translations - Flat translation object for a single locale
   * @returns {function(string, object=): string}
   */
  function createTranslator(translations) {
    return function (key, vars) {
      var keys = key.split(".");
      var value = translations;

      for (var i = 0; i < keys.length; i++) {
        if (typeof value !== "object" || value === null) return key;
        value = value[keys[i]];
      }

      if (typeof value === "undefined" || typeof value === "object") return key;
      var result = String(value);

      if (!vars) return result;

      if (Array.isArray(vars)) {
        return vars.reduce(function (str, v) {
          return str.replace(/\{[^}]+\}/, String(v));
        }, result);
      }

      return Object.keys(vars).reduce(function (str, k) {
        return str.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
      }, result);
    };
  }

  /**
   * Create a translator scoped to a namespace.
   * @param {string} namespace - e.g. "commands/speedtest", "themes/degoog"
   * @returns {function(string, object=): string}
   */
  window.scopedT = function (namespace) {
    return createTranslator(namespaces[namespace] || {});
  };

  /**
   * Global translate - merges all theme namespace translations into one object.
   * Commands/slots get their own scoped t() via IIFE injection.
   */
  var merged = {};
  Object.keys(namespaces).forEach(function (ns) {
    if (ns.indexOf("themes/") !== 0) return;
    var src = namespaces[ns];
    Object.keys(src).forEach(function (k) {
      if (typeof merged[k] !== "object") merged[k] = {};
      Object.assign(merged[k], src[k]);
    });
  });

  window.t = createTranslator(merged);
})();
