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

# Clone a pret source repository unless the expected checkout already exists.
[private]
_clone-source root repository:
    #!/usr/bin/env sh
    set -eu
    clone_root="{{root}}"
    repository="{{repository}}"
    target="$clone_root/$repository"
    expected_url="https://github.com/pret/$repository.git"
    mkdir -p "$clone_root"
    if [ -e "$target" ]; then
        if [ ! -d "$target/.git" ]; then
            echo "$target exists but is not a Git checkout." >&2
            exit 1
        fi
        origin="$(git -C "$target" remote get-url origin 2>/dev/null || true)"
        case "$origin" in
            "https://github.com/pret/$repository"|"https://github.com/pret/$repository.git"|"git@github.com:pret/$repository.git")
                echo "Using existing $target"
                ;;
            *)
                echo "$target has unexpected origin '$origin'." >&2
                exit 1
                ;;
        esac
    else
        git clone "$expected_url" "$target"
    fi

# Clone the FireRed/LeafGreen source repository.
clone-frlg root:
    just _clone-source "{{root}}" pokefirered

# Clone the Ruby/Sapphire source repository.
clone-rs root:
    just _clone-source "{{root}}" pokeruby

# Clone the Emerald source repository.
clone-emerald root:
    just _clone-source "{{root}}" pokeemerald

# Clone the Red/Blue source repository.
clone-rb root:
    just _clone-source "{{root}}" pokered

# Clone the Yellow source repository.
clone-yellow root:
    just _clone-source "{{root}}" pokeyellow

# Clone the Gold/Silver source repository.
clone-gs root:
    just _clone-source "{{root}}" pokegold

# Clone the Crystal source repository.
clone-crystal root:
    just _clone-source "{{root}}" pokecrystal

# Clone every source repository below one directory.
clone-all root:
    just clone-rb "{{root}}"
    just clone-yellow "{{root}}"
    just clone-gs "{{root}}"
    just clone-crystal "{{root}}"
    just clone-rs "{{root}}"
    just clone-frlg "{{root}}"
    just clone-emerald "{{root}}"

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

# Install the pinned Ruby/Sapphire generator dependencies.
install-rs-tools: install-schema-tools
    npm ci --prefix tools/rs

# Install the pinned Emerald generator dependencies.
install-emerald-tools: install-schema-tools
    npm ci --prefix tools/emerald

# Install the pinned JSON Schema validator.
install-schema-tools:
    npm ci --prefix tools/package-schema

# Check contributor documentation without restoring application dependencies.
check-docs:
    node --test tools/check-docs.test.mjs
    node tools/check-docs.mjs

# Check generator syntax and compile the application.
check: check-docs install-schema-tools
    dotnet run --project {{schema_project}} -- --check
    node --test tools/package-schema/validate.test.mjs
    node --test tools/package-finalization.test.mjs
    node --test tools/gen2/generated-package.test.mjs
    node --test tools/crystal/generated-package.test.mjs
    node --test tools/frlg/generated-package.test.mjs
    node --test tools/rs/generated-package.test.mjs
    node --test tools/emerald/generated-package.test.mjs
    node --check tools/frlg/generate-fieldguide.mjs
    node --check tools/frlg/audit-renewable-hidden-items.mjs
    node --check tools/frlg/renewable-hidden-items.mjs
    node --check tools/frlg/render-maps.mjs
    node --check tools/rb/generate-fieldguide.mjs
    node --check tools/yellow/generate-fieldguide.mjs
    node --check tools/gen2/build-package.mjs
    node --check tools/gen2/renewable-resources.mjs
    node --check tools/gen2/connected-world.mjs
    node --check tools/gen2/display-names.mjs
    node --check tools/gen2/map-layouts.mjs
    node --check tools/gen2/map-rendering.mjs
    node --check tools/gen2/sprite-rendering.mjs
    node --check tools/gs/build-package.mjs
    node --check tools/gs/generate-fieldguide.mjs
    node --check tools/crystal/build-package.mjs
    node --check tools/crystal/generate-fieldguide.mjs
    node --check tools/gen3/display-names.mjs
    node --check tools/gen3/map-rendering.mjs
    node --check tools/gen3/package-building.mjs
    node --check tools/gen3/script-extraction.mjs
    node --check tools/gen3/source-data.mjs
    node --check tools/gen3/sprite-rendering.mjs
    node --check tools/gen3/item-sprites.mjs
    node --check tools/gen3/world-topology.mjs
    node --check tools/rs/build-package.mjs
    node --check tools/rs/generate-fieldguide.mjs
    node --check tools/emerald/build-package.mjs
    node --check tools/emerald/generate-fieldguide.mjs
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

# Regenerate the complete Ruby/Sapphire package from a pokeruby checkout.
generate-rs source: install-rs-tools
    node tools/rs/generate-fieldguide.mjs "{{source}}"

# Regenerate the complete Emerald package from a pokeemerald checkout.
generate-emerald source: install-emerald-tools
    node tools/emerald/generate-fieldguide.mjs "{{source}}"

# Regenerate every package from conventionally named source checkouts.
generate-all root:
    just generate-rb "{{root}}/pokered"
    just generate-yellow "{{root}}/pokeyellow"
    just generate-gs "{{root}}/pokegold"
    just generate-crystal "{{root}}/pokecrystal"
    just generate-rs "{{root}}/pokeruby"
    just generate-frlg "{{root}}/pokefirered"
    just generate-emerald "{{root}}/pokeemerald"
