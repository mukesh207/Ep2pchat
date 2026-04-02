## PR Checklist
- [ ] `cargo test --workspace` passes
- [ ] `npm run build` passes
- [ ] No private key material in logs
- [ ] RLS context set on all new DB queries
- [ ] Tauri commands use `Result<T, String>`, no `unwrap()`
