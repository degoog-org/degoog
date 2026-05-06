#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.}"
DRY_RUN="${DRY_RUN:-0}"

if [ ! -d "$TARGET" ]; then
  echo "ERROR: '$TARGET' is not a directory." >&2
  exit 1
fi

has_bin() { command -v "$1" >/dev/null 2>&1; }
if ! has_bin perl; then
  echo "ERROR: perl is required." >&2
  exit 1
fi

declare -A MAP=(
  ["ext-card"]="degoog-panel degoog-panel--ext-card"
  ["sidebar-panel"]="degoog-panel degoog-panel--stack-item"
  ["results-slot-panel"]="degoog-panel degoog-panel--slot degoog-panel--stack-item"

  ["tools-dropdown"]="degoog-dropdown degoog-dropdown--menu"
  ["tools-submenu"]="degoog-dropdown degoog-dropdown--submenu"
  ["result-actions-menu"]="degoog-dropdown degoog-dropdown--menu degoog-dropdown--actions-menu"

  ["search-bar"]="degoog-search-bar"
  ["results-search-bar"]="degoog-search-bar degoog-search-bar--results"
  ["settings-nav-search"]="degoog-search-bar degoog-search-bar--square"

  ["store-input-url"]="degoog-input"
  ["ext-field-input"]="degoog-input"
  ["ext-field-urllist-input"]="degoog-input"
  ["settings-rate-limit-input"]="degoog-input"
  ["settings-proxy-urls"]="degoog-input"
  ["settings-score-domain"]="degoog-input"
  ["settings-score-value"]="degoog-input"
  ["store-search-input"]="degoog-input"
  ["tools-date-input"]="degoog-input degoog-input--sm degoog-input--tools degoog-input--tools-date"
  ["tools-lang-filter"]="degoog-input degoog-input--sm degoog-input--tools degoog-input--tools-filter"

  ["theme-select-wrap"]="degoog-select-wrap degoog-select-wrap--flex"
  ["settings-nav-mobile"]="degoog-select-wrap degoog-select-wrap--mobile-only"
  ["ext-field-select-wrap"]="degoog-select-wrap"

  ["settings-toggle-wrap"]="degoog-toggle-wrap"
  ["engine-toggle"]="degoog-toggle-wrap degoog-toggle-wrap--transparent"

  ["toggle-slider"]="degoog-toggle"

  ["sidebar-accordion"]="degoog-accordion"
  ["sidebar-accordion-body"]="degoog-accordion-body"
  ["sidebar-accordion-toggle"]="degoog-accordion-toggle degoog-accordion-toggle--sidebar"
  ["store-updates-panel"]="degoog-accordion"
  ["store-updates-body"]="degoog-accordion-body degoog-accordion-body--flex"
  ["store-updates-toggle"]="degoog-accordion-toggle"

  ["results-tab"]="degoog-tab"
  ["tools-toggle"]="degoog-tab"

  ["tools-menu-item"]="degoog-menu-item degoog-menu-item--lg"
  ["tools-option"]="degoog-menu-item degoog-menu-item--option"
  ["result-actions-item"]="degoog-menu-item"

  ["result-engine-tag"]="degoog-badge degoog-badge--engine-tag"
  ["store-type-badge"]="degoog-badge degoog-badge--store-type"
  ["store-subtype-badge"]="degoog-badge"
  ["glance-ai-badge"]="degoog-badge"

  ["search-submit-btn"]="degoog-icon-btn"
  ["settings-gear"]="degoog-icon-btn degoog-icon-btn--padded degoog-icon-btn--results-gear"
  ["img-lightbox-close"]="degoog-icon-btn degoog-icon-btn--lightbox-close"
  ["ext-modal-close"]="degoog-icon-btn"
  ["media-preview-close"]="degoog-icon-btn degoog-icon-btn--media-preview-close"

  ["btn"]="degoog-btn"
  ["btn--primary"]="degoog-btn--primary"
  ["btn--secondary"]="degoog-btn--secondary"
  ["btn--danger"]="degoog-btn--danger"

  ["result-item"]="degoog-result"
  ["result-item-inner"]="degoog-result--inner"
  ["result-body"]="degoog-result--body"
  ["result-thumbnail-wrap"]="degoog-result--thumb"
  ["result-url-row"]="degoog-result--url-row"
  ["result-favicon"]="degoog-result--favicon"
  ["result-cite"]="degoog-result--cite"
  ["result-actions"]="degoog-result--actions"
  ["result-actions-toggle"]="degoog-result--actions-toggle"
  ["result-title"]="degoog-result--title"
  ["result-snippet"]="degoog-result--snippet"
  ["result-engines"]="degoog-result--engines"

  ["glance-box"]="degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack"
  ["glance-ai"]="degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack"
  ["glance-snippet"]="degoog-text degoog-text--md"
  ["glance-link"]="degoog-link"
  ["glance-sources"]="degoog-text degoog-text--sm degoog-text--secondary degoog-text--spaced"
  ["glance-ai-dive"]="degoog-link-btn"
  ["glance-ai-input"]="degoog-input degoog-input--chat"
)

append_for_file() {
  local file="$1"
  local tmp="${file}.tmp.$$"

  cp "$file" "$tmp"

  for old in "${!MAP[@]}"; do
    local new="${MAP[$old]}"
    OLD_CLASS="$old" NEW_CLASS="$new" perl -0777 -i -pe '
      my $old = $ENV{OLD_CLASS};
      my $new = $ENV{NEW_CLASS};
      s/(class=(["'\''"]))(.*?)(\2)/$1 . _append($3, $old, $new) . $4/ge;
      sub _append {
        my ($v, $old, $new) = @_;
        my @c = grep { length } split(/\s+/, $v);
        my %seen; @c = grep { !$seen{$_}++ } @c;
        my %has = map { $_ => 1 } @c;
        if ($has{$old}) {
          for my $cls (split(/\s+/, $new)) {
            next if !$cls;
            push @c, $cls if !$has{$cls}++;
          }
        }
        return join(" ", @c);
      }
    ' -- "$tmp"
  done

  if ! cmp -s "$file" "$tmp"; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "would-update: ${file#$TARGET/}"
      rm -f "$tmp"
    else
      mv "$tmp" "$file"
      echo "updated: ${file#$TARGET/}"
    fi
  else
    rm -f "$tmp"
  fi
}

export -f append_for_file
export TARGET DRY_RUN

while IFS= read -r -d '' file; do
  append_for_file "$file"
done < <(find "$TARGET" \
  -not \( -path "*/node_modules/*" -o -path "*/stores/*" -o -path "*/.git/*" \) \
  \( -name "*.html" -o -name "*.htm" \) \
  -print0)

