# Install only missing shared plugins; preserve other plugins and their versions.
set -l manifest (path dirname (status filename))/plugins.list
set -l plugins (string match -r '^[^#\s]+$' < "$manifest")

if not functions -q fisher
    set -l bootstrap (mktemp)
    or exit 1
    if not curl -fsSL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish -o "$bootstrap"
        command rm -f "$bootstrap"
        exit 1
    end
    source "$bootstrap"
    set -l load_status $status
    command rm -f "$bootstrap"
    test "$load_status" -eq 0; or exit "$load_status"
end

set -l installed (string replace -r '@[^@]+$' '' -- (fisher list))
set -l missing
for plugin in $plugins
    if not contains -- "$plugin" $installed
        set -a missing "$plugin"
    end
end

if set -q missing[1]
    fisher install $missing
else
    printf 'Plugins Fish: al día\n'
end
