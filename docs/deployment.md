# Deployment

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. Pushes to `main` and manual workflow dispatches publish the Blazor WebAssembly application.

Pull requests targeting `main` run the separate `.github/workflows/validate.yml` build without deploying. Configure the `Validate / build` check as required in the `main` branch ruleset if merges should be blocked until the release build succeeds.

In repository settings, configure Pages to use **GitHub Actions** as its source. The workflow:

1. installs .NET 10;
2. restores the dependency lock file and publishes `PokemonFieldGuide/PokemonFieldGuide.csproj` in Release configuration without a second restore;
3. changes the HTML `<base>` from `/` to the repository path;
4. applies the same repository base to the published service worker;
5. creates `.nojekyll`;
6. copies `index.html` to `404.html` for SPA route fallback;
7. uploads and deploys the Pages artifact.

## Base-path requirements

All catalog, data, map, sprite, stylesheet, and script URLs must be relative. Do not introduce leading-slash asset paths. A path such as `games/frlg/data/fieldguide.json` resolves beneath either `/` locally or `/<repository>/` on Pages.

When editing startup or deployment files, preserve base-path rewriting for both `index.html` and the published `service-worker.js`. A correct page with an incorrect service-worker base may work on first load but fail offline or serve stale/missing assets later.

## Pre-deployment checks

Run:

```sh
dotnet publish PokemonFieldGuide/PokemonFieldGuide.csproj -c Release -o release
```

Confirm that `release/wwwroot` contains:

- `games/catalog.json`;
- every registered package's configured data files;
- package maps and sprite fallbacks;
- `service-worker.js` and its asset manifest;
- `index.html`, the stylesheet, and PWA icons.

For a local approximation of repository-path hosting, rewrite the publish output using the same substitutions as the workflow and serve the parent directory. Check the initial load, a force refresh, direct navigation to a client route, and service-worker registration.

## Other static hosts

The application has no server-side runtime requirement. Any static host can serve the published `wwwroot` directory if it:

- uses the correct base path;
- provides an SPA fallback to `index.html`;
- serves WebAssembly and JSON with suitable content types;
- serves over HTTPS when service-worker support is desired.
