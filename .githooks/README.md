# Shared git hooks

This repo keeps its git hooks under version control in `.githooks/` so every
clone (and every terminal / agent session) runs the same checks.

## One-time setup per clone

```sh
git config core.hooksPath .githooks
```

That's it — git will now run the hooks in this folder. (Hooks in the default
`.git/hooks/` are NOT shared via the repo, which is why we point git here.)

## Hooks

- **commit-msg** — rejects commit messages mangled by passing a PowerShell
  here-string (`@'...'@`) to a POSIX shell. That mistake leaves the subject
  line as a lone `@`, which then shows up as the (useless) deployment
  description in Vercel. Write multi-line messages with repeated `-m` flags:

  ```sh
  git commit -m "Subject line" -m "Body paragraph" -m "Co-Authored-By: ..."
  ```

  Bypass deliberately (rarely needed) with `git commit --no-verify`.
