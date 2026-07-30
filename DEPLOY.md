# Деплой на Vercel с PostgreSQL

## 1. Почему сейчас ошибка 500

Ошибка:

```text
PrismaClientInitializationError: Environment variable not found: DATABASE_URL
```

означает, что на Vercel у проекта нет переменной окружения `DATABASE_URL`.
Prisma читает подключение к PostgreSQL из `prisma/schema.prisma`:

```prisma
url = env("DATABASE_URL")
```

Пока переменная не задана, любой API-метод с базой будет падать.

## 2. Создать PostgreSQL

Рекомендуемый вариант:

1. Открыть проект на Vercel.
2. Перейти в `Storage` или `Marketplace`.
3. Выбрать PostgreSQL-провайдера, например Neon.
4. Создать базу и подключить ее к проекту.
5. Проверить в `Settings -> Environment Variables`, что появилась переменная:

```env
DATABASE_URL=postgresql://...
```

Переменная должна быть добавлена минимум для `Production`. Для preview-деплоев добавьте ее и в `Preview`.

## 3. Если база уже есть

В Vercel:

1. `Project -> Settings -> Environment Variables`.
2. Добавить `DATABASE_URL`.
3. Вставить строку подключения PostgreSQL.
4. Выбрать окружения: `Production`, при необходимости `Preview` и `Development`.
5. Сохранить.
6. Сделать новый deploy. Старые деплои не получают новые env-переменные автоматически.

Через CLI:

```bash
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
vercel --prod
```

## 4. Установить зависимости локально

```bash
npm install
```

## 5. Подтянуть env локально

Если проект уже связан с Vercel:

```bash
vercel env pull .env.local
```

Или вручную создать `.env.local`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

## 6. Создать таблицы

Для первой настройки базы:

```bash
npm run db:migrate
```

Для production/Vercel:

```bash
npm run db:deploy
```

## 7. Создать первого администратора

Локально, с рабочим `DATABASE_URL`:

```bash
npm run db:seed
```

Стартовый админ из seed:

```text
логин: admin
пароль: admin123
```

После первого входа лучше поменять пароль в базе или добавить отдельную страницу смены пароля.

## 8. Проверить перед production

```bash
npm run build
```

## 9. Задеплоить

Через GitHub:

1. Запушить код в GitHub.
2. Vercel сам соберет новый deploy.
3. После добавления `DATABASE_URL` обязательно нажать `Redeploy`.

Через CLI:

```bash
vercel
vercel --prod
```

## 10. Важный порядок

1. Создать PostgreSQL.
2. Добавить `DATABASE_URL` в Vercel.
3. Сделать redeploy.
4. Применить миграции.
5. Запустить seed для первого админа.
6. Проверить `/api/auth/login`.
