#!/usr/bin/env bash
# coding-buddy diagnostic test status line
# Outputs multiple padding strategies + multi-line check + width check

cat > /dev/null  # drain stdin

# ANSI colors
NC=$'\033[0m'
DIM=$'\033[2m'
GOLD=$'\033[38;2;255;193;7m'
GREEN=$'\033[38;2;78;186;101m'
BLUE=$'\033[38;2;87;105;247m'

# Header
echo "${DIM}--- coding-buddy statusline test ---${NC}"

# Multi-line check
echo "LINE_1_top"
echo "LINE_2_middle"
echo "LINE_3_bottom"

# Padding strategies (each marker should align if strategy works)
PAD=30
echo "$(printf '%*s' "$PAD" '')|SPACE_${PAD}_END"
B=$'\xe2\xa0\x80'
braille=""
for ((i=0; i<PAD; i++)); do braille="${braille}${B}"; done
echo "${braille}|BRAILLE_${PAD}_END"
NBSP=$'\xc2\xa0'
nbsp=""
for ((i=0; i<PAD; i++)); do nbsp="${nbsp}${NBSP}"; done
echo "${nbsp}|NBSP_${PAD}_END"

# Mini buddy art (mushroom)
echo "${GOLD}-o-OO-o-${NC}"
echo "${GOLD}(________)${NC}"
echo "${GOLD}  |° °|${NC}"
echo "${GOLD}  |__|${NC}"
echo "${DIM}MUSHROOM${NC}"

exit 0
