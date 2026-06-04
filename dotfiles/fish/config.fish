# homebrew
eval (/opt/homebrew/bin/brew shellenv)
set -g fish_greeting ""

function alert
    set -l message (test -n "$argv[1]"; and echo $argv; or echo "Proceso finalizado")
    terminal-notifier \
        -title "Ghostty" \
        -subtitle (prompt_pwd) \
        -message $message \
        -sound Glass \
        -activate com.mitchellh.ghostty
end

if status is-interactive
    starship init fish | source
    fzf --fish | source
    atuin init fish | source
    zoxide init fish | source
    fnm env --use-on-cd | source
    
    abbr --add g git
    abbr --add gs git status
    abbr --add ga git add .
    abbr --add gc --set-cursor 'git commit -m "%"'
    abbr --add gp git push
    abbr --add gl git log --oneline --graph --decorate --all
    abbr --add gco git checkout
    abbr --add gd git diff

    abbr --add .. cd ..
    abbr --add ... cd ../..
    abbr --add .... cd ../../..
    abbr --add ~ cd ~
    abbr --add - cd -

    abbr --add l 'eza --icons -F -H --group-directories-first --git'
    abbr --add ls 'eza --icons --group-directories-first'
    abbr --add la 'eza -la --icons --git --group-directories-first'
    abbr --add ll 'eza --icons -l -g --git --time-style=long-iso --group-directories-first'
    abbr --add lt --set-cursor 'eza --icons --tree --level=%'
    abbr --add lta eza --tree -a --level=1 --icons --ignore-glob='.git'

    abbr --add pn pnpm
    abbr --add pni pnpm install
    abbr --add pnu pnpm update
    abbr --add pnd pnpm dev
    abbr --add pnb pnpm build
    abbr --add pnt pnpm test
    abbr --add pns pnpm start

    abbr --add cc claude
    abbr --add c clear
end

# Editor Default
set -gx EDITOR vim