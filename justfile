project := "PokemonFieldGuide/PokemonFieldGuide.csproj"
release_dir := "release"

# List available project commands.
default:
    @just --list

# Restore the exact NuGet dependency graph from the lock file.
restore:
    dotnet restore {{project}} --locked-mode

# Build the application.
build: restore
    dotnet build {{project}} --no-restore

# Run the development server.
run: restore
    dotnet run --project {{project}} --no-restore

# Produce the release build used by GitHub Pages.
publish: restore
    dotnet publish {{project}} -c Release -o {{release_dir}} --no-restore

# Install the pinned FRLG generator dependencies.
install-frlg-tools:
    npm ci --prefix tools/frlg

# Check generator syntax and compile the application.
check:
    node --check tools/frlg/generate-fieldguide.mjs
    node --check tools/frlg/render-maps.mjs
    dotnet restore {{project}} --locked-mode
    dotnet build {{project}} --no-restore

# Regenerate FRLG guide and Pokédex data from a pokefirered checkout.
generate-frlg-data source: install-frlg-tools
    node tools/frlg/generate-fieldguide.mjs "{{source}}"

# Regenerate FRLG maps and world placement data from a pokefirered checkout.
generate-frlg-maps source: install-frlg-tools
    node tools/frlg/render-maps.mjs "{{source}}"

# Regenerate all FRLG data and maps from a pokefirered checkout.
generate-frlg source: install-frlg-tools
    node tools/frlg/generate-fieldguide.mjs "{{source}}"
    node tools/frlg/render-maps.mjs "{{source}}"
