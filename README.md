# AI CI Auto Fixer

GitHub Actions の失敗ログを読み取り、AI で修正パッチを生成し、テストを回し、成功したら Pull Request を作る自動修正ツールです。

対応 provider:

- `AI_PROVIDER=openai` GPT 系モデル
- `AI_PROVIDER=anthropic` Claude 系モデル
- `AI_PROVIDER=command` Codex CLI / Claude Code / 任意コマンド

## できること

- 失敗した GitHub Actions run のログ取得
- 関連ファイルの自動抽出
- AI に unified diff を生成させる
- `git apply` で差分適用
- 許可されたファイルだけ変更されているか検査
- `npm test` などのテストコマンド実行
- 失敗したら最大回数まで再修正
- テスト成功時だけ branch push + PR 作成
- 全 repo に `.github/workflows/ai-ci-fixer.yml` を一括配置

## 必要な Secret

各導入先 repo または org に設定してください。

- `AI_FIXER_GITHUB_TOKEN`
  - Contents read/write
  - Pull requests read/write
  - Actions read
  - Metadata read

OpenAI を使う場合:

- `OPENAI_API_KEY`
- Repository Variables: `AI_PROVIDER=openai`, `AI_MODEL=gpt-5.1` など

Claude を使う場合:

- `ANTHROPIC_API_KEY`
- Repository Variables: `AI_PROVIDER=anthropic`, `AI_MODEL=claude-sonnet-4-5` など

Codex CLI / Claude Code / 任意コマンドを使う場合:

- Secret: `AI_FIX_COMMAND`
- Repository Variables: `AI_PROVIDER=command`

`AI_FIX_COMMAND` は stdin で JSON を受け取り、stdout に次の JSON を返すコマンドにしてください。

```json
{
  "summary": "what changed",
  "patch": "diff --git a/src/example.ts b/src/example.ts\n..."
}
```

## 単体テスト

このリポジトリにはまだ `package-lock.json` をコミットしていないため、現時点では `npm install` を使います。

```bash
npm install
npm test
```

## 手動実行

```bash
export AI_FIXER_GITHUB_TOKEN=github_pat_xxx
export AI_PROVIDER=openai
export OPENAI_API_KEY=sk-xxx
npm run fix -- --owner YOUR_OWNER --repo YOUR_REPO --run-id 123456789 --base-ref main
```

## 全 repo に workflow を一括導入

中央 repo 名を指定します。

```bash
export AI_FIXER_GITHUB_TOKEN=github_pat_xxx
export AI_FIXER_REPO=YOUR_OWNER/ai-ci-auto-fixer
npm run install-workflow -- --owner YOUR_OWNER
```

Organization 全体:

```bash
npm run install-workflow -- --owner YOUR_ORG --org --include-private
```

## repo ごとの設定

各 repo に `.ai-fixer.yml` を置くと制御できます。

```yaml
maxAttempts: 3
testCommand: npm test
buildCommand: npm run build
dryRun: false
allowedPaths:
  - src/**
  - test/**
  - tests/**
  - package.json
  - package-lock.json
blockedPaths:
  - .github/**
  - .env*
  - '**/*.pem'
```

## 安全設計

このツールは main に直接 push しません。必ず修正 branch を作り、テストが通ったときだけ PR を作ります。

初期設定では `.github/**`, `.env*`, 秘密鍵、画像、圧縮ファイルなどは AI に変更させません。
