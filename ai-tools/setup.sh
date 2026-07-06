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

src = os.path.realpath(sys.argv[1])
dst = os.path.realpath(sys.argv[2])
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
  local dest_parent dest_parent_real target_rel

  [[ -e "$source_abs" ]] || die "No existe el origen: $source_abs"

  dest_parent="$(dirname "$dest_path")"
  ensure_dir "$dest_parent" || return 0
  dest_parent_real="$(abspath_dir "$dest_parent")" || die "No se pudo resolver el destino: $dest_parent"

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

  target_rel="$(relpath_py "$source_abs" "$dest_parent_real")"
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

resource_exists_kind() {
  local path="$1"
  local kind="$2"

  case "$kind" in
    file) [[ -f "$path" ]] ;;
    dir) [[ -d "$path" ]] ;;
    *) die "Tipo de recurso no soportado: $kind" ;;
  esac
}

validate_required_resource() {
  local source_dir="$1"
  local name="$2"
  local kind="$3"

  resource_exists_kind "$source_dir/$name" "$kind" || die "No se encontro: $source_dir/$name"
}

validate_optional_json_resource() {
  local source_dir="$1"
  local name="$2"

  if [[ -f "$source_dir/$name" ]]; then
    validate_json_file "$source_dir/$name" || die "JSON invalido: $source_dir/$name"
  fi
}

print_opencode_link_plan() {
  local source_dir="$1"
  local dest_dir="$2"
  local entry name kind

  info "Se crearan estos enlaces simbolicos:"
  for entry in opencode.json:file agents:dir docs:dir; do
    name="${entry%%:*}"
    kind="${entry#*:}"
    validate_required_resource "$source_dir" "$name" "$kind"
    info "  $dest_dir/$name -> $source_dir/$name"
  done

  for entry in commands:dir modes:dir plugins:dir skills:dir tools:dir themes:dir tui.json:file opencode-notifier.json:file package.json:file package-lock.json:file AGENTS.md:file; do
    name="${entry%%:*}"
    kind="${entry#*:}"
    if resource_exists_kind "$source_dir/$name" "$kind"; then
      info "  $dest_dir/$name -> $source_dir/$name"
    fi
  done
}

install_opencode_resource() {
  local source_dir="$1"
  local dest_dir="$2"
  local name="$3"
  local kind="$4"
  local required="$5"

  if ! resource_exists_kind "$source_dir/$name" "$kind"; then
    if [[ "$required" == "required" ]]; then
      die "No se encontro: $source_dir/$name"
    fi
    return 0
  fi

  create_link_relative "$source_dir/$name" "$dest_dir/$name"
}

install_opencode_dependencies() {
  local source_dir="$1"
  local dest_dir="$2"
  local -a npm_cmd

  [[ -f "$source_dir/package.json" ]] || return 0

  if ! path_already_correct "$dest_dir/package.json" "$source_dir/package.json"; then
    warn "No se instalan dependencias npm: $dest_dir/package.json no apunta a este repo."
    return 0
  fi

  if [[ -f "$source_dir/package-lock.json" ]] && ! path_already_correct "$dest_dir/package-lock.json" "$source_dir/package-lock.json"; then
    warn "No se instalan dependencias npm: $dest_dir/package-lock.json no apunta a este repo."
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    warn "No se instalan dependencias npm: no se encontro el comando npm."
    return 0
  fi

  info ""
  info "Los plugins locales de OpenCode necesitan dependencias npm en:"
  info "  $dest_dir/node_modules"
  info "node_modules no se versiona; se instala localmente en tu maquina."

  if ! confirm "Instalar o actualizar dependencias npm de OpenCode"; then
    warn "Dependencias npm omitidas. Los plugins locales pueden no cargar hasta instalar dependencias en $dest_dir."
    return 0
  fi

  if [[ -f "$source_dir/package-lock.json" ]]; then
    npm_cmd=(npm ci --ignore-scripts)
  else
    npm_cmd=(npm install --ignore-scripts)
  fi

  info "Ejecutando: ${npm_cmd[*]}"
  (cd "$dest_dir" && "${npm_cmd[@]}")
  ok "Dependencias npm instaladas en: $dest_dir/node_modules"
}

repo_root() {
  abspath_dir "$(dirname "${BASH_SOURCE[0]}")"
}

opencode_config_dir() {
  [[ -n "${HOME:-}" ]] || die "HOME no esta definido."
  printf "%s" "$HOME/.config/opencode"
}

install_opencode() {
  local root source_dir dest_dir entry name kind
  root="$(repo_root)"
  source_dir="$root/opencode"
  dest_dir="$(opencode_config_dir)"

  [[ -d "$source_dir" ]] || die "No se encontro la carpeta opencode en: $source_dir"
  validate_required_resource "$source_dir" "opencode.json" "file"
  validate_required_resource "$source_dir" "agents" "dir"
  validate_required_resource "$source_dir" "docs" "dir"
  validate_json_file "$source_dir/opencode.json" || die "JSON invalido: $source_dir/opencode.json"
  validate_optional_json_resource "$source_dir" "tui.json"
  validate_optional_json_resource "$source_dir" "opencode-notifier.json"

  info ""
  info "${C_BOLD}Instalacion OpenCode${C_RESET}"
  info "Origen:  $source_dir"
  info "Destino: $dest_dir"
  info ""
  print_opencode_link_plan "$source_dir" "$dest_dir"

  if ! confirm "Continuar"; then
    info "Saliendo."
    return 0
  fi

  ensure_dir "$dest_dir" || die "No se pudo preparar el directorio destino: $dest_dir"
  for entry in opencode.json:file agents:dir docs:dir; do
    name="${entry%%:*}"
    kind="${entry#*:}"
    install_opencode_resource "$source_dir" "$dest_dir" "$name" "$kind" "required"
  done

  for entry in commands:dir modes:dir plugins:dir skills:dir tools:dir themes:dir tui.json:file opencode-notifier.json:file package.json:file package-lock.json:file AGENTS.md:file; do
    name="${entry%%:*}"
    kind="${entry#*:}"
    install_opencode_resource "$source_dir" "$dest_dir" "$name" "$kind" "optional"
  done

  install_opencode_dependencies "$source_dir" "$dest_dir"

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
      q|x|salir|exit|quit) printf "%s" "quit"; return 0 ;;
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

  if [[ "$provider" == "quit" ]]; then
    info "Saliendo."
    exit 0
  fi

  info "Proveedor: $(provider_label "$provider")"
  install_provider "$provider"
}

main "$@"
