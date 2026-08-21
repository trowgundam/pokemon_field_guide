project := "PokemonFieldGuide/PokemonFieldGuide.csproj"
test_project := "PokemonFieldGuide.Tests/PokemonFieldGuide.Tests.csproj"
schema_project := "tools/PokemonFieldGuide.SchemaGenerator/PokemonFieldGuide.SchemaGenerator.csproj"
release_dir := "release"

# List available project commands.
default:
    @just --list

# Restore the exact NuGet dependency graph from the lock file.
restore:
    dotnet restore {{project}} --locked-mode
    dotnet restore {{test_project}} --locked-mode
    dotnet restore {{schema_project}} --locked-mode

# Generate JSON Schemas from the authoritative C# contracts.
generate-schemas:
    dotnet run --project {{schema_project}}

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
install-frlg-tools: install-schema-tools
    npm ci --prefix tools/frlg

# Install the pinned Red/Blue generator dependencies.
install-rb-tools: install-schema-tools
    npm ci --prefix tools/rb

# Install the pinned Yellow generator dependencies.
install-yellow-tools: install-schema-tools
    npm ci --prefix tools/yellow

# Install the pinned Gold/Silver generator dependencies.
install-gs-tools: install-schema-tools
    npm ci --prefix tools/gs

# Install the pinned Crystal generator dependencies.
install-crystal-tools: install-schema-tools
    npm ci --prefix tools/crystal

# Install the pinned JSON Schema validator.
install-schema-tools:
    npm ci --prefix tools/package-schema

# Check generator syntax and compile the application.
check: install-schema-tools
    dotnet run --project {{schema_project}} -- --check
    node --test tools/package-schema/validate.test.mjs
    node --test tools/package-finalization.test.mjs
    node --test tools/gen2/generated-package.test.mjs
    node --test tools/crystal/generated-package.test.mjs
    node --check tools/frlg/generate-fieldguide.mjs
    node --check tools/frlg/render-maps.mjs
    node --check tools/rb/generate-fieldguide.mjs
    node --check tools/yellow/generate-fieldguide.mjs
    node --check tools/gen2/build-package.mjs
    node --check tools/gen2/connected-world.mjs
    node --check tools/gen2/display-names.mjs
    node --check tools/gen2/map-layouts.mjs
    node --check tools/gen2/map-rendering.mjs
    node --check tools/gen2/sprite-rendering.mjs
    node --check tools/gs/build-package.mjs
    node --check tools/gs/generate-fieldguide.mjs
    node --check tools/crystal/build-package.mjs
    node --check tools/crystal/generate-fieldguide.mjs
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

# Regenerate the complete Gold/Silver package from a pokegold checkout.
generate-gs source: install-gs-tools
    node tools/gs/generate-fieldguide.mjs "{{source}}"

# Regenerate the complete Crystal package from a pokecrystal checkout.
generate-crystal source: install-crystal-tools
    node tools/crystal/generate-fieldguide.mjs "{{source}}"
