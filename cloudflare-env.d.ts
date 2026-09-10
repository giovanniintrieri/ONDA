/// <reference types="@cloudflare/workers-types" />

// The optional starter helper guards access before using this unconfigured binding.
declare namespace Cloudflare {
  interface Env { DB?: D1Database; }
}
