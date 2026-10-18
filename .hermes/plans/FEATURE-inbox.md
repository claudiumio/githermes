## Feature: Inbox tab (GitHermes plugin)
- Trigger: user switches tab to `inbox` in desktop pane.
- Data: `gh search prs --assignee @me --state open --limit 30 --json number,title,state,author,updatedAt,url,repository` and same for issues (`gh search issues ...`).
- UI: new JSX block inside `plugin.js` registered under `tab === 'inbox'`.
- State: extend `githubShellStore` with `tab` value `inbox`; existing `prs`/`issues` unchanged.
- No new backend; uses existing `shell.exec` + `GH`.
