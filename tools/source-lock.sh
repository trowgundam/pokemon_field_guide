#!/usr/bin/env sh
set -eu

usage() {
    echo "Usage: $0 <clone|check> <lock-file> <repository> <checkout> [remote-url]" >&2
    exit 2
}

fail() {
    echo "$1" >&2
    exit 1
}

[ "$#" -eq 4 ] || [ "$#" -eq 5 ] || usage
operation="$1"
lock_file="$2"
repository="$3"
checkout="$4"
default_url="https://github.com/pret/$repository.git"
remote_url="${5:-$default_url}"

[ -f "$lock_file" ] || fail "Source lock file '$lock_file' does not exist."
revision="$(awk -v repository="$repository" '
    /^[[:space:]]*(#|$)/ { next }
    $1 == repository { count++; value = $2; invalid = invalid || NF != 2 }
    END {
        if (count != 1 || invalid) exit 1
        print value
    }
' "$lock_file")" || fail "Source lock must contain exactly one valid entry for '$repository'."
case "$revision" in
    ''|*[!0-9a-f]*) fail "Source lock has an invalid revision for '$repository'." ;;
esac
[ "${#revision}" -eq 40 ] || fail "Source lock revision for '$repository' must be a full 40-character SHA."

check_checkout() {
    [ -d "$checkout/.git" ] || fail "$checkout is not a Git checkout."
    origin="$(git -C "$checkout" remote get-url origin 2>/dev/null || true)"
    if [ "$remote_url" = "$default_url" ]; then
        case "$origin" in
            "https://github.com/pret/$repository"|"$default_url"|"git@github.com:pret/$repository.git") ;;
            *) fail "$checkout has unexpected origin '$origin'." ;;
        esac
    elif [ "$origin" != "$remote_url" ]; then
        fail "$checkout has unexpected origin '$origin'."
    fi

    head="$(git -C "$checkout" rev-parse HEAD 2>/dev/null || true)"
    [ "$head" = "$revision" ] || fail "$repository is locked at $revision but checkout HEAD is $head."
    [ -z "$(git -C "$checkout" status --porcelain)" ] || fail "$checkout has uncommitted source changes."
}

case "$operation" in
    check)
        check_checkout
        ;;
    clone)
        if [ -e "$checkout" ]; then
            check_checkout
            echo "Using locked checkout $checkout at $revision"
            exit 0
        fi

        parent="$(dirname "$checkout")"
        name="$(basename "$checkout")"
        mkdir -p "$parent"
        temporary="$(mktemp -d "$parent/.$name.source-lock.XXXXXX")"
        cleanup() { rm -rf -- "$temporary"; }
        trap cleanup EXIT HUP INT TERM
        git init --quiet "$temporary"
        git -C "$temporary" remote add origin "$remote_url"
        git -C "$temporary" fetch --quiet --depth 1 origin "$revision"
        git -C "$temporary" checkout --quiet --detach FETCH_HEAD
        mv "$temporary" "$checkout"
        temporary=""
        trap - EXIT HUP INT TERM
        check_checkout
        ;;
    *)
        usage
        ;;
esac
