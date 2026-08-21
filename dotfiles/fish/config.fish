# Docker Desktop
fish_add_path --append --path "$HOME/.docker/bin"

# homebrew
if not set -q HOMEBREW_PREFIX
    for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew
        if test -x "$brew_path"
            eval ($brew_path shellenv)
            break
        end
    end
end
set -g fish_greeting ""

# Disable all Claude Code compatibility in OpenCode.
set -gx OPENCODE_DISABLE_CLAUDE_CODE 1

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
    if type -q starship
        starship init fish | source
    end
    if type -q atuin
        atuin init fish | source
    end
    if type -q zoxide
        zoxide init fish | source
    end
    if type -q fnm
        fnm env --use-on-cd --shell fish | source
    end

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

    abbr --add cc claude
    abbr --add oc opencode
    abbr --add occ 'opencode -c'

    abbr --add c clear
    abbr --add bu 'brew update && brew upgrade && brew autoremove && brew cleanup'

end

# Editor Default
set -gx EDITOR vim

# Machine-specific settings that must not be synced to the repository.
if test -f "$HOME/.config/fish/local.fish"
    source "$HOME/.config/fish/local.fish"
end
