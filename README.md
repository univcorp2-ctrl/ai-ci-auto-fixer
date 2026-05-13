# AI CI Auto Fixer

GitHub Actions の失敗ログを読み取り、AI で修正パッチを生成し、ローカルでテストを回し、成功したら自動で PR を作るための中央管理リポジトリです。

対応方針:

- GitHub Actions の失敗ログを GitHub API から取得
- GPT / Claude / 任意の外部コマンド（Codex CLI、Claude Code など）を provider として利用
- 変更候補は unified diff として受け取り、`git apply` で適用
- 許可されたファイルだけを変更
- テストを複数回実行し、失敗したら再修正を試行
- 成功したらブランチを push し、Pull Request を作成
- 全リポジトリへの導入は `install-workflow` コマンドで一括配置

## 1. 必要な GitHub Secrets

このリポジトリ、または導入先リポジトリに以下を設定してください。

### 必須

- `AI_FIXER_GITHUB_TOKEN`
  - Fine-grained PAT か GitHub App token
  - 必要権限: Contents read/write, Pull requests read/write, Actions read, Metadata read

### AI provider 別

OpenAI を使う場合:

- `OPENAI_API_KEY`
- `AI_PROVIDER=openai`
- `AI_MODEL=gpt-5.1` など

Anthropic Claude を使う場合:

- `ANTHROPIC_API_KEY`
- `AI_PROVIDER=anthropic`
- `AI_MODEL=claude-sonnet-4-5` など

Codex CLI / Claude Code / 任意 CLI を使う場合:

- `AI_PROVIDER=command`
- `AI_FIX_COMMAND='codex exec --json'` など

`command` provider は標準入力に JSON を渡し、標準出力から以下の JSON を受け取ります。

```json
{
  "summary": "what changed",
  "patch": "diff --git ..."
}
```

## 2. 中央リポで単体実行

```bash
npm ci
npm test
npm run build
```

失敗した run を指定して手動実行:

```bash
npm run fix -- \
  --owner YOUR_OWNER \
  --repo YOUR_REPO \
  --run-id 123456789 \
  --base-ref main
```

## 3. 全リポジトリに workflow を一括導入

```bash
export AI_FIXER_GITHUB_TOKEN=github_pat_xxx
export AI_FIXER_REPO=YOUR_OWNER/ai-ci-auto-fixer
npm run install-workflow -- --owner YOUR_OWNER
```

Organization の全 repo に入れる場合:

```bash
npm run install-workflow -- --owner YOUR_ORG --org
```

private repo を含める場合:

```bash
npm run install-workflow -- --owner YOUR_ORG --org --include-private
```

## 4. 導入される workflow

各 repo に `.github/workflows/ai-ci-fixer.yml` を追加します。

- `workflow_run` で CI 失敗時に起動
- この中央リポジトリを checkout
- `npm ci && npm run fix` を実行
- テスト成功時だけ PR 作成

## 5. 安全設計

初期設定では以下のファイルは変更禁止です。

- `.github/**`
- `package-lock.json` 以外の lockfile は必要に応じて制御
- `.env*`
- 秘密鍵、証明書、バイナリ

許可・拒否パターンは `.ai-fixer.yml` で repo ごとに変更できます。

```yaml
maxAttempts: 3
testCommand: npm test
buildCommand: npm run build
allowedPaths:
  - src/**
  - test/**
  - package.json
  - package-lock.json
blockedPaths:
  - .github/**
  - .env*
```

## 6. 運用のおすすめ

最初は `dryRun: true` で始め、対象 repo を数個に絞ってください。安定したら org 全体に広げます。

この仕組みは「自動で main に push」ではなく、必ず PR を作ります。人間のレビューを残す設計です。
