# Архитектура

Без сборки. Все файлы статические, ES-модули, пути относительные (работает в подпапке GitHub Pages).

```
index.html              оболочка, подключает js/app.js
styles.css              тёмная тема, переменные в :root
manifest.webmanifest    параметры PWA
sw.js                   Service Worker: кэш файлов (VERSION), стратегия «кэш, потом сеть»
icons/                  иконки 192, 512, maskable, apple-touch
js/app.js               вкладки, перерисовка render(), регистрация SW
js/util.js              h() и svg() для создания элементов, даты, числа, окна (sheet, dialog), toast
js/db.js                обёртка IndexedDB (хранилища workouts, measurements, exercises, meta)
js/store.js             данные в памяти S, операции, статистика, резервная копия (build/parse/apply)
js/charts.js            lineChart и barChart на SVG
js/views/*.js           экраны: home, workouts (+ редактор), measures, progress, data
```

## Модель данных
- workout: `{id, date 'YYYY-MM-DD', feel 'easy|medium|hard|', notes, exercises:[{name, sets:[{w, r, rpe, rir}]}], createdAt, updatedAt}`. Числа в подходах хранятся строками как введены (допускается запятая), разбираются через `num()`.
- measurement: `{id, date, type, value:number, createdAt}`
- exercises: `{name}` только свои; стандартные список в store.js
- meta: `measureTypes` (список `{name, unit, builtin}`), `lastBackup` (ISO)

## Принципы
- Все пользовательские строки выводятся через textContent (h()), без innerHTML.
- Редактор тренировки автосохраняет с задержкой 350 мс и при закрытии; пустая новая тренировка не сохраняется.
- Импорт валидирует файл и пишет одной транзакцией (при ошибке ничего не меняется).
- Даты считаются в локальном времени (не toISOString), чтобы не было сдвига по часовому поясу.
- Объём = сумма вес×повторы по подходам с весом > 0. 1ПМ по формуле Эпли.
- При изменении файлов приложения увеличивать VERSION в sw.js.
