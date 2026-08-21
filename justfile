project := "PokemonFieldGuide/PokemonFieldGuide.csproj"
test_project := "PokemonFieldGuide.Tests/PokemonFieldGuide.Tests.csproj"
release_dir := "release"

# List available project commands.
default:
    @just --list

# Restore the exact NuGet dependency graph from the lock file.
restore:
    dotnet restore {{project}} --locked-mode
    dotnet restore {{test_project}} --locked-mode

# Build the application.
build: restore
    dotnet build {{project}} --no-restore

# Run the development server.
run: restore
    dotnet run --project {{project}} --no-restore

# Run the Game package tests.
test: restore
    dotnet test {{test_project}} --no-restore

# Produce the release build used by GitHub Pages.
publish: restore
    dotnet publish {{project}} -c Release -o {{release_dir}} --no-restore

# Install the pinned FRLG generator dependencies.
install-frlg-tools:
    npm ci --prefix tools/frlg

# Install the pinned Red/Blue generator dependencies.
install-rb-tools:
    npm ci --prefix tools/rb

# Install the pinned Yellow generator dependencies.
install-yellow-tools:
    npm ci --prefix tools/yellow

# Check generator syntax and compile the application.
check:
    node --test tools/package-finalization.test.mjs
    node --check tools/frlg/generate-fieldguide.mjs
    node --check tools/frlg/render-maps.mjs
    node --check tools/rb/generate-fieldguide.mjs
    node --check tools/yellow/generate-fieldguide.mjs
    node tools/validate-generated-data.mjs
    dotnet restore {{test_project}} --locked-mode
    dotnet test {{test_project}} --no-restore
    dotnet build {{project}} --no-restore

# Regenerate the complete FRLG package from a pokefirered checkout.
generate-frlg source: install-frlg-tools
    node tools/frlg/generate-fieldguide.mjs "{{source}}"

# Regenerate the complete Red/Blue package from a pokered checkout.
generate-rb source: install-rb-tools
    node tools/rb/generate-fieldguide.mjs "{{source}}"

# Regenerate the complete Yellow package from a pokeyellow checkout.
generate-yellow source: install-yellow-tools
    node tools/yellow/generate-fieldguide.mjs "{{source}}"
