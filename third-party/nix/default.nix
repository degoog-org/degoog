{ self, inputs, ... }:
{
  perSystem =
    {
      pkgs,
      system,
      lib,
      ...
    }:
    let
      commonModule = { lib, ... }: {
        imports = [
          self.nixosModules.default
        ];

        services.degoog = {
          enable = true;
          configurePostgres = true;

          environment = {
            DEGOOG_DANGEROUSLY_NO_PASSWORD = true;
            DEGOOG_PUBLIC_INSTANCE = false;
            DEGOOG_WIZARD = false;
            LOG_LEVEL = "debug";
          };
        };
      };

      nixosConfiguration = inputs.nixpkgs.lib.nixosSystem {
        inherit system;

        modules = [
          commonModule
          "${inputs.nixpkgs}/nixos/modules/virtualisation/qemu-vm.nix"
          {
            networking.firewall.enable = false;
            services.getty.autologinUser = "root";

            virtualisation = {
              diskImage = null;

              forwardPorts = [
                {
                  from = "host";
                  host.port = 4444;
                  guest.port = 4444;
                }
              ];
            };
          }
        ];
      };
    in
    {
      checks.module = pkgs.testers.runNixOSTest {
        name = "degoog";

        nodes.machine = commonModule;

        testScript = ''
          start_all()

          with subtest("start degoog"):
            machine.wait_for_unit("degoog.service")
            machine.wait_for_open_port(4444)
        '';
      };

      apps.run-in-vm = {
        type = "app";

        program = lib.getExe nixosConfiguration.config.system.build.vm;
      };

      packages.default = pkgs.callPackage ./package.nix {
        bun2nix = inputs.bun2nix.packages.${system}.default;
        src = inputs.self;
      };
    };

  flake.nixosModules.default = import ./module.nix self;
}
