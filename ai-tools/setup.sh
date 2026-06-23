#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Instalador interactivo de configuraciones compartidas.
# No contiene rutas de usuario: cada equipo instala en su propio $HOME.

C_RESET=""
C_BOLD=""
C_RED=""
C_YEL=""
C_GRN=""
C_CYAN=""
if [[ -t 2 ]] && command -v tput >/dev/null 2>&1; then
  C_RESET="$(tput sgr0)"
  C_BOLD="$(tput bold)"
  C_RED="$(tput setaf 1)"
  C_YEL="$(tput setaf 3)"
  C_GRN="$(tput setaf 2)"
  C_CYAN="$(tput setaf 6)"
fi

err() { printf "%sError:%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }
warn() { printf "%sAviso:%s %s\n" "$C_YEL" "$C_RESET" "$*" >&2; }
info() { printf "%s%s%s\n" "$C_CYAN" "$*" "$C_RESET" >&2; }
ok() { printf "%s%s%s\n" "$C_GRN" "$*" "$C_RESET" >&2; }
die() { err "$*"; exit 1; }

read_prompt() {
  local __var="$1"
  shift
  local prompt="$*"
  printf "%s" "$prompt" >&2
  IFS= read -r "$__var" || die "Entrada cancelada."
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "No se encontro el comando requerido: $1"
}

to_lower() {
  printf "%s" "$1" | tr '[:upper:]' '[:lower:]'
}

trim_quotes() {
  local s="$1"
  s="${s%\"}"
  s="${s#\"}"
  s="${s%\'}"
  s="${s#\'}"
  printf "%s" "$s"
}

abspath_dir() {
  local p="$1"
  (cd "$p" >/dev/null 2>&1 && pwd -P) || return 1
}

relpath_py() {
  local source_path="$1"
  local dest_dir="$2"
  python3 - <<'PY' "$source_path" "$dest_dir"
import os
import sys

src = sys.argv[1]
dst = sys.argv[2]
print(os.path.relpath(src, start=dst))
PY
}

path_already_correct() {
  local path="$1"
  local target_abs="$2"
  [[ -e "$path" || -L "$path" ]] || return 1
  python3 - "$path" "$target_abs" <<'PY'
import os
import sys

path = sys.argv[1]
target = sys.argv[2]
sys.exit(0 if os.path.realpath(path) == os.path.realpath(target) else 1)
PY
}

confirm() {
  local prompt="$1"
  local ans ans_lc
  while true; do
    read_prompt ans "$prompt (s/n): "
    ans_lc="$(to_lower "$(trim_quotes "$ans")")"
    case "$ans_lc" in
      s|si|sí|y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "Responde 's' o 'n'." ;;
    esac
  done
}

backup_existing() {
  local target="$1"
  local stamp backup

  [[ -n "$target" ]] || die "Ruta vacia al intentar crear backup."
  [[ "$target" != "/" ]] || die "Intento de reemplazar el directorio raiz."

  stamp="$(date +%Y%m%d%H%M%S)"
  backup="$target.backup.$stamp"
  if [[ -e "$backup" || -L "$backup" ]]; then
    backup="$backup.$$"
  fi

  mv -- "$target" "$backup"
  warn "Backup creado: $backup"
}

ensure_dir() {
  local dir="$1"

  if [[ -L "$dir" && -d "$dir" ]]; then
    return 0
  fi

  if [[ -L "$dir" && ! -d "$dir" ]]; then
    info ""
    warn "El destino es un symlink roto o no apunta a un directorio: $dir"
    if confirm "Moverlo a backup y crear el directorio"; then
      backup_existing "$dir"
    else
      return 1
    fi
  elif [[ -e "$dir" && ! -d "$dir" ]]; then
    info ""
    warn "El destino existe y no es un directorio: $dir"
    if confirm "Moverlo a backup y crear el directorio"; then
      backup_existing "$dir"
    else
      return 1
    fi
  fi

  mkdir -p -- "$dir"
}

create_link_relative() {
  local source_abs="$1"
  local dest_path="$2"
  local dest_parent target_rel

  [[ -e "$source_abs" ]] || die "No existe el origen: $source_abs"

  dest_parent="$(dirname "$dest_path")"
  ensure_dir "$dest_parent" || return 0

  if [[ -e "$dest_path" || -L "$dest_path" ]]; then
    if path_already_correct "$dest_path" "$source_abs"; then
      ok "Ya existe correcto: $dest_path"
      return 0
    fi

    info ""
    warn "Ya existe: $dest_path"
    if confirm "Reemplazarlo por un symlink al repo"; then
      backup_existing "$dest_path"
    else
      warn "Omitido: $dest_path"
      return 0
    fi
  fi

  target_rel="$(relpath_py "$source_abs" "$dest_parent")"
  ln -s -- "$target_rel" "$dest_path"
  ok "Enlazado: $dest_path -> $target_rel"
}

validate_json_file() {
  local file_path="$1"
  python3 - "$file_path" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as fh:
    json.load(fh)
PY
}

repo_root() {
  abspath_dir "$(dirname "${BASH_SOURCE[0]}")"
}

opencode_config_dir() {
  [[ -n "${HOME:-}" ]] || die "HOME no esta definido."
  printf "%s" "$HOME/.config/opencode"
}

install_opencode() {
  local root source_dir dest_dir
  root="$(repo_root)"
  source_dir="$root/opencode"
  dest_dir="$(opencode_config_dir)"

  [[ -d "$source_dir" ]] || die "No se encontro la carpeta opencode en: $source_dir"
  [[ -d "$source_dir/agents" ]] || die "No se encontro: $source_dir/agents"
  [[ -d "$source_dir/docs" ]] || die "No se encontro: $source_dir/docs"
  [[ -f "$source_dir/opencode.json" ]] || die "No se encontro: $source_dir/opencode.json"

  validate_json_file "$source_dir/opencode.json" || die "JSON invalido: $source_dir/opencode.json"

  info ""
  info "${C_BOLD}Instalacion OpenCode${C_RESET}"
  info "Origen:  $source_dir"
  info "Destino: $dest_dir"
  info ""
  info "Se crearan estos enlaces simbolicos:"
  info "  $dest_dir/opencode.json -> $source_dir/opencode.json"
  info "  $dest_dir/agents        -> $source_dir/agents"
  info "  $dest_dir/docs          -> $source_dir/docs"

  if ! confirm "Continuar"; then
    info "Saliendo."
    return 0
  fi

  ensure_dir "$dest_dir" || die "No se pudo preparar el directorio destino: $dest_dir"
  create_link_relative "$source_dir/opencode.json" "$dest_dir/opencode.json"
  create_link_relative "$source_dir/agents" "$dest_dir/agents"
  create_link_relative "$source_dir/docs" "$dest_dir/docs"

  ok ""
  ok "OpenCode instalado. Reinicia opencode para cargar la configuracion."
}

provider_label() {
  case "$1" in
    opencode) printf "%s" "OpenCode" ;;
    all) printf "%s" "Todos" ;;
    *) printf "%s" "$1" ;;
  esac
}

install_provider() {
  case "$1" in
    opencode) install_opencode ;;
    all) install_opencode ;;
    *) die "Proveedor no soportado: $1" ;;
  esac
}

select_provider() {
  local choice choice_lc

  while true; do
    info ""
    info "${C_BOLD}Selecciona proveedor a instalar${C_RESET}"
    info "  1) OpenCode"
    info "  0) Todos"
    info "  q) Salir"
    info ""

    read_prompt choice "Opcion: "
    choice_lc="$(to_lower "$(trim_quotes "$choice")")"
    case "$choice_lc" in
      1|opencode|open-code) printf "%s" "opencode"; return 0 ;;
      0|all|todos|todo) printf "%s" "all"; return 0 ;;
      q|x|salir|exit|quit) info "Saliendo."; exit 0 ;;
      *) warn "Opcion invalida." ;;
    esac
  done
}

usage() {
  cat >&2 <<'EOF'
Uso:
  ./setup.sh              # selector interactivo
  ./setup.sh opencode     # instalar OpenCode
  ./setup.sh all          # instalar todo

Instala configuraciones compartidas mediante enlaces simbolicos en $HOME.
EOF
}

main() {
  require_cmd date
  require_cmd dirname
  require_cmd ln
  require_cmd mkdir
  require_cmd mv
  require_cmd python3
  require_cmd tr
  require_cmd pwd

  local provider
  if (( $# > 1 )); then
    usage
    exit 1
  fi

  if (( $# == 1 )); then
    case "$1" in
      -h|--help|help) usage; exit 0 ;;
      *) provider="$(to_lower "$1")" ;;
    esac
  else
    provider="$(select_provider)"
  fi

  info "Proveedor: $(provider_label "$provider")"
  install_provider "$provider"
}

main "$@"
