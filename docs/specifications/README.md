# 設計仕様書（Design Specifications）

ホワイトボード型 社内ポータルダッシュボードの設計仕様書です。

## フェーズ一覧

| Phase | タイトル | 状態 | ドキュメント |
|-------|---------|------|-------------|
| Phase 0 | 前提・用語・ゴール定義 | 完了 | [phase0-goals-and-definitions.md](./phase0-goals-and-definitions.md) |
| Phase 1 | データ仕様（Spreadsheet = DB） | 完了 | [phase1-data-specification.md](./phase1-data-specification.md) |
| Phase 2 | UI/UX仕様（閲覧・編集体験） | 完了 | [phase2-ui-ux-specification.md](./phase2-ui-ux-specification.md) |
| Phase 3 | レイアウト計算（auto整列アルゴリズム） | 完了 | [phase3-layout-calculation.md](./phase3-layout-calculation.md) |
| Phase 4 | 埋め込み詳細（AppSheet/GAS/自作Web） | 完了 | [phase4-embed-specification.md](./phase4-embed-specification.md) |
| Phase 5 | 権限・監査・運用仕様 | 完了 | [phase5-permission-audit-operation.md](./phase5-permission-audit-operation.md) |
| Phase 6 | 実装方針（技術スタック・システム構成） | 完了 | [phase6-implementation-design.md](./phase6-implementation-design.md) |
| Phase 7 | MVP定義と拡張ロードマップ | 完了 | [phase7-mvp-roadmap.md](./phase7-mvp-roadmap.md) |
| Phase 8 | MVP実装タスク分解 | 完了 | [phase8-mvp-implementation-tasks.md](./phase8-mvp-implementation-tasks.md) |
| Phase 9 | 初期リリース後の改善リスト | 完了 | [phase9-post-release-improvements.md](./phase9-post-release-improvements.md) |
| Phase 10 | 運用UI（総務向け管理画面）設計 | 完了 | [phase10-admin-ui-design.md](./phase10-admin-ui-design.md) |

## 設計方針

- 実装を開始する前に、全フェーズの設計を完了させる
- 各フェーズは前フェーズの内容を前提とする
- 設計仕様書は実装の「正」として機能する
