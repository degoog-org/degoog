{
  lib,
  src,
  git,
  runCommandLocal,
  bun2nix,
  ...
}:
bun2nix.writeBunApplication {
  inherit src;
  packageJson = "${src}/package.json";

  buildPhase = "bun run build";

  startScript = "bun run start";

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = runCommandLocal "fetch-degoog-deps" { } ''
      ${lib.getExe bun2nix} --lock-file ${src}/bun.lock --output-file $out
    '';
  };

  runtimeInputs = [
    git
  ];

  meta = {
    description = "Search engine aggregator with a comprehensive plugin/extension system";
    homepage = "https://github.com/degoog-org/degoog";
    license = lib.licenses.agpl3Only;
    maintainers = [ lib.maintainers.quadradical ];
  };
}
