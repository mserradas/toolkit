function md --description 'Read Markdown with highlighting and a compact width'
    set -l width 100
    if set -q COLUMNS; and test "$COLUMNS" -gt 0; and test "$COLUMNS" -lt 100
        set width $COLUMNS
    end
    command bat --language=Markdown --style=plain --wrap=character --terminal-width=$width --paging=auto $argv
end
