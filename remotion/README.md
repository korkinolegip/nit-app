# НИТЬ — Demo Video (Remotion)

**Формат:** 1080×1920 (портрет, 9:16), 30fps, 29 секунд

## Сцены
| # | Сцена | Время |
|---|-------|-------|
| 1 | Intro — логотип + нити | 0–3s |
| 2 | Hook — "не свайпы" | 3–8s |
| 3 | Chat — AI разговор | 8–15s |
| 4 | Match — совместимость 87% | 15–20s |
| 5 | Profile — полный профиль | 20–25s |
| 6 | Outro — CTA | 25–29s |

## Запуск

```bash
cd remotion
npm install

# Предпросмотр в браузере (интерактивно)
npm run preview

# Рендер видео (нужен ffmpeg)
npm run render
# → out/nit-demo.mp4
```

## Требования
- Node.js 18+
- ffmpeg (для рендера): `brew install ffmpeg`

## Настройка
- Поменяй `@NitMatch_bot` в `SceneOutro` на актуальный username бота
- Можно добавить реальные фото в `SceneMatch` и `SceneProfile`
- Цвета: `BG = '#0b0b0b'`, шрифт: Inter (загружается из системы)
