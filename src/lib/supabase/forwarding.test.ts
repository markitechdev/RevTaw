import { describe, expect, it } from "vitest";

import { forwardableAddress } from "@/lib/supabase/forwarding";

describe("forwardableAddress", () => {
  it("keeps the client's IPv4 or IPv6 address, the first of a forwarded list", () => {
    expect(forwardableAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(forwardableAddress(" 203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(forwardableAddress("2001:db8::1")).toBe("2001:db8::1");
  });

  it("forwards nothing else", () => {
    for (const value of [null, undefined, "", "unknown", "evil.example", "203.0.113.7\r\nx-admin: 1", "<script>", "1.2.3"]) {
      expect(forwardableAddress(value)).toBeNull();
    }
  });
});
