#!/bin/bash
# ============================================
#  update.sh — Оновлення сайту з Claude
# ============================================
#  Використання:
#    1. Скачай файли з Claude (вони потрапляють в ~/Downloads)
#    2. Запусти: bash update.sh "опис змін"
#
#  Скрипт сам:
#    - Знайде нові файли в ~/Downloads
#    - Скопіює їх у правильні місця в репо
#    - Зробить git add + commit + push
# ============================================

REPO_DIR="$HOME/Documents/Repositories/oleksandr-site"
DOWNLOADS="$HOME/Downloads"

# Колір для виводу
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Оновлення сайту...${NC}"
echo ""

cd "$REPO_DIR" || { echo -e "${RED}❌ Папка $REPO_DIR не знайдена${NC}"; exit 1; }

# Файли та куди вони йдуть
declare -A FILE_MAP=(
  ["index.html"]="index.html"
  ["sitemap.xml"]="sitemap.xml"
  ["robots.txt"]="robots.txt"
  ["worker.js"]="api/send-chat.js"
)

COPIED=0

for src_name in "${!FILE_MAP[@]}"; do
  src_file="$DOWNLOADS/$src_name"
  dst_file="$REPO_DIR/${FILE_MAP[$src_name]}"

  if [ -f "$src_file" ]; then
    # Перевіряємо чи файл свіжий (змінений за останні 2 години)
    if [ "$(find "$src_file" -mmin -120 2>/dev/null)" ]; then
      mkdir -p "$(dirname "$dst_file")"
      cp "$src_file" "$dst_file"
      echo -e "  ${GREEN}✓${NC} $src_name → ${FILE_MAP[$src_name]}"
      COPIED=$((COPIED + 1))
    else
      echo -e "  ${YELLOW}⏭${NC} $src_name — старіший за 2 год, пропускаю"
    fi
  fi
done

echo ""

if [ "$COPIED" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Нових файлів у Downloads не знайдено.${NC}"
  echo "   Скачай файли з Claude і запусти знову."
  exit 0
fi

# Git
echo -e "${GREEN}📦 Git...${NC}"

# Перевіряємо чи є зміни
if git diff --quiet && git diff --cached --quiet; then
  echo -e "${YELLOW}⚠️  Git не бачить змін (файли ідентичні)${NC}"
  exit 0
fi

COMMIT_MSG="${1:-update from Claude}"

git add .
git commit -m "$COMMIT_MSG"
git push

echo ""
echo -e "${GREEN}✅ Готово! Зміни на Vercel через ~30 секунд.${NC}"
echo -e "   Коміт: ${YELLOW}$COMMIT_MSG${NC}"
echo -e "   Файлів оновлено: ${YELLOW}$COPIED${NC}"
