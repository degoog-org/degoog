self:
{
  pkgs,
  lib,
  config,
  ...
}:

let
  inherit (lib)
    mkIf
    mkOption
    mkEnableOption
    mkPackageOption
    optional
    optionalAttrs
    boolToString
    types
    ;

  inherit (types)
    attrsOf
    bool
    nullOr
    path
    port
    str
    submodule
    oneOf
    int
    ;

  cfg = config.services.degoog;
in
{
  options.services.degoog = {
    enable = mkEnableOption "Degoog, a search engine aggregator with a comprehensive plugin/extension system";

    package = mkPackageOption self.packages.${pkgs.stdenv.hostPlatform.system} "default" { };

    environmentFile = mkOption {
      type = nullOr path;
      default = null;
      example = "/run/secrets/degoog.env";
      description = "EnvironmentFile as defined in {manpage}`systemd.exec(5)`.";
    };

    configurePostgres = mkEnableOption "PostgreSQL locally using services.postgresql";

    environment = mkOption {
      description = ''
        Environment variables used to configure Degoog.

        Any environment variable supported by Degoog may be specified,
        even if it is not explicitly declared by this module.
      '';

      type = submodule {
        freeformType = attrsOf (
          nullOr (oneOf [
            str
            bool
            path
            int
          ])
        );

        options = {
          DEGOOG_PORT = mkOption {
            type = port;
            default = 4444;
            description = "The port Degoog listens on.";
            example = 8080;
          };

          DEGOOG_UNIX_SOCKET = mkOption {
            type = nullOr path;
            default = null;
            description = "Path to a Unix socket for Degoog to listen on.";
            example = "/run/degoog/degoog.sock";
          };

          DEGOOG_BASE_URL = mkOption {
            type = str;
            default = "";
            description = ''
              Base URL when hosting Degoog under a path.

              For example, `/degoog` when Degoog is served from `https://example.com/degoog`.
            '';
            example = "/degoog";
          };

          DEGOOG_WIZARD = mkOption {
            type = bool;
            default = false;
            description = "Whether to enable the startup wizard.";
            example = true;
          };

          DEGOOG_DISTRUST_PROXY = mkOption {
            type = bool;
            default = false;
            description = "Whether Degoog should distrust incoming reverse proxy connections.";
            example = true;
          };

          DEGOOG_PUBLIC_INSTANCE = mkOption {
            type = bool;
            default = true;
            description = "Whether this is a public Degoog instance.";
            example = false;
          };

          DEGOOG_SETTINGS_PASSWORDS = mkOption {
            type = nullOr str;
            default = null;
            description = ''
              Password used to protect Degoog settings.

              It is recommended to provide this through {option}`services.degoog.environmentFile` rather than putting it directly in the Nix configuration.
            '';
            example = "changeme";
          };

          DEGOOG_DANGEROUSLY_NO_PASSWORD = mkOption {
            type = bool;
            default = false;
            description = ''
              Disable the settings password protection.

              This is dangerous for publicly accessible instances.
            '';
            example = false;
          };

          DEGOOG_POSTGRES = mkOption {
            type = nullOr str;
            default = null;
            description = "PostgreSQL connection URL used by Degoog.";
            example = "postgresql://degoog:changeme@localhost:5432/degoog";
          };

          DEGOOG_POSTGRES_HOST = mkOption {
            type = nullOr str;
            default = null;
            description = ''
              PostgreSQL host used by Degoog, as an alternative to
              {option}`services.degoog.environment.DEGOOG_POSTGRES`.
              Useful when your deployment hands you credentials as
              individual keys, such as a Kubernetes secret (CNPG,
              bjw-s app-template). `DEGOOG_POSTGRES` wins when both
              are set.
              A host starting with `/` is a Unix socket (peer auth,
              no password), which a URL cannot express.
            '';
            example = "degoog-postgres";
          };

          DEGOOG_POSTGRES_PORT = mkOption {
            type = nullOr port;
            default = null;
            description = "PostgreSQL port used by Degoog.";
            example = 5432;
          };

          DEGOOG_POSTGRES_USER = mkOption {
            type = nullOr str;
            default = null;
            description = "PostgreSQL user used by Degoog.";
            example = "degoog";
          };

          DEGOOG_POSTGRES_PASSWORD = mkOption {
            type = nullOr str;
            default = null;
            description = ''
              PostgreSQL password used by Degoog.
              It is recommended to provide this through
              {option}`services.degoog.environmentFile` rather than
              putting it directly in the Nix configuration.
            '';
            example = "changeme";
          };

          DEGOOG_POSTGRES_DATABASE = mkOption {
            type = nullOr str;
            default = null;
            description = "PostgreSQL database used by Degoog.";
            example = "degoog";
          };
        };
      };

      default = { };

      example = {
        DEGOOG_PORT = 8080;
        DEGOOG_WIZARD = false;
        DEGOOG_DISTRUST_PROXY = true;
      };
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion =
          !cfg.configurePostgres
          || !(lib.any (name: lib.hasPrefix "DEGOOG_POSTGRES" name && cfg.environment.${name} != null) (
            builtins.attrNames cfg.environment
          ));

        message = ''
          `services.degoog.configurePostgres` cannot be used together with
          `services.degoog.environment.DEGOOG_POSTGRES` or any of the
          `services.degoog.environment.DEGOOG_POSTGRES_*` options.

          Disable `configurePostgres` if you want to provide your own
          PostgreSQL connection details.
        '';
      }
    ];

    services.postgresql = mkIf cfg.configurePostgres {
      enable = true;

      ensureDatabases = [
        "degoog"
      ];

      ensureUsers = [
        {
          name = "degoog";
          ensureDBOwnership = true;
        }
      ];
    };

    systemd.services.degoog = {
      description = "Degoog, a search engine aggregator with a comprehensive plugin/extension system";

      after = [
        "network-online.target"
      ]
      ++ optional cfg.configurePostgres "postgresql.service";

      wants = [
        "network-online.target"
      ];

      wantedBy = [
        "multi-user.target"
      ];

      environment =
        lib.mapAttrs (_: value: if builtins.isBool value then boolToString value else toString value) (
          lib.filterAttrs (_: value: value != null) cfg.environment
        )
        // {
          BUN_INSTALL_CACHE_DIR = "/tmp/bun";
          DEGOOG_DATA_DIR = toString config.systemd.services.degoog.serviceConfig.WorkingDirectory;
        }
        // optionalAttrs cfg.configurePostgres {
          DEGOOG_POSTGRES_HOST = "/var/run/postgresql";
          DEGOOG_POSTGRES_USER = "degoog";
        };

      serviceConfig = {
        Type = "simple";

        WorkingDirectory = "/var/lib/degoog";
        StateDirectory = "degoog";
        RuntimeDirectory = "degoog";

        ExecStart = lib.getExe cfg.package;

        Restart = "on-failure";
        TimeoutSec = 15;

        EnvironmentFile = cfg.environmentFile;

        NoNewPrivileges = true;
        SystemCallArchitectures = "native";

        RestrictAddressFamilies = [
          "AF_UNIX"
          "AF_INET"
          "AF_INET6"
        ];

        RuntimeDirectoryMode = "0770";
        UMask = "0007";

        PrivateUsers = true;
        DynamicUser = true;

        RestrictNamespaces = !config.boot.isContainer;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;

        ProtectControlGroups = !config.boot.isContainer;
        ProtectSystem = "strict";
        ProtectHostname = true;
        ProtectKernelLogs = !config.boot.isContainer;
        ProtectKernelModules = !config.boot.isContainer;
        ProtectKernelTunables = !config.boot.isContainer;
        ProtectClock = true;

        ProtectProc = "noaccess";
        ProcSubset = "pid";

        ProtectHome = true;

        CapabilityBoundingSet = "";

        LockPersonality = true;

        PrivateTmp = !config.boot.isContainer;
        PrivateDevices = true;
        RemoveIPC = true;

        SystemCallFilter = [
          "~@clock"
          "~@aio"
          "~@chown"
          "~@cpu-emulation"
          "~@debug"
          "~@keyring"
          "~@memlock"
          "~@module"
          "~@mount"
          "~@obsolete"
          "~@privileged"
          "~@raw-io"
          "~@reboot"
          "~@setuid"
          "~@swap"
          "~@resources"
        ];

        SystemCallErrorNumber = "EPERM";
      };
    };
  };
}
