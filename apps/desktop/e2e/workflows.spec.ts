import { expect, test, APIRequestContext } from "@playwright/test";
import WebSocket from "ws";

const backendOrigin = process.env.E2E_BACKEND_ORIGIN ?? "http://127.0.0.1:3000";
const wsOrigin = backendOrigin.startsWith("https://")
  ? backendOrigin.replace("https://", "wss://")
  : backendOrigin.replace("http://", "ws://");

type AccountFixture = {
  user_id: string;
  org_id: string;
  device_id: string;
  email: string;
  token: string;
};

type BootstrapFixture = {
  admin: AccountFixture;
  alice: AccountFixture;
  bob: AccountFixture;
  outsider: AccountFixture;
  pending_user: {
    user_id: string;
    email: string;
    access_code: string;
  };
};

async function resetData(request: APIRequestContext) {
  const response = await request.post(`${backendOrigin}/api/v1/test/reset`);
  expect(response.ok()).toBeTruthy();
}

async function bootstrapData(request: APIRequestContext, scenario: string): Promise<BootstrapFixture> {
  const response = await request.post(`${backendOrigin}/api/v1/test/bootstrap`, {
    data: { scenario },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as BootstrapFixture;
}

function connectWs(token: string, deviceId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${wsOrigin}/ws?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceId)}`
    );
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("WebSocket connection timeout"));
    }, 10_000);

    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function waitForJsonMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = 10_000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timed out waiting for message"));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!predicate(parsed)) return;
      clearTimeout(timeout);
      ws.off("message", onMessage);
      resolve(parsed);
    };

    ws.on("message", onMessage);
  });
}

test.describe("Frontend + Backend workflows", () => {
  test.beforeEach(async ({ request }) => {
    await resetData(request);
  });

  test("onboarding request lands in admin pending queue", async ({ page, request }) => {
    const fixture = await bootstrapData(request, "onboarding-pending");
    const email = `hire-${Date.now()}@trustline.test`;

    await page.goto(`/?e2e_token=${encodeURIComponent(fixture.admin.token)}`);
    await page.fill("#email-input", email);
    await page.click("#enter-btn");

    await expect(page.locator(".status-card-title")).toContainText("Access request sent");
    await expect(page.locator(".access-code-value")).not.toContainText("WAIT-ROOM");

    const pendingResponse = await request.get(`${backendOrigin}/api/v1/admin/pending-users`, {
      headers: { Authorization: `Bearer ${fixture.admin.token}` },
    });
    expect(pendingResponse.ok()).toBeTruthy();
    const pendingData = await pendingResponse.json();
    expect((pendingData.users as Array<any>).some((u) => u.email === email)).toBeTruthy();
  });

  test("admin panel approves pending user", async ({ page, request }) => {
    const fixture = await bootstrapData(request, "admin-approve");

    await page.goto(`/?e2e_token=${encodeURIComponent(fixture.admin.token)}`);
    await page.click("#admin-btn");

    await expect(page.locator(".section-header-title")).toContainText("PENDING APPROVALS");
    const approveButton = page.locator(`#approve-${fixture.pending_user.user_id}`);
    await expect(approveButton).toBeVisible();
    const approveRequest = page.waitForResponse((response) =>
      response.url().includes("/api/v1/admin/approve-user") &&
      response.request().method() === "POST"
    );
    await approveButton.click();
    const approveResponse = await approveRequest;
    expect(approveResponse.ok()).toBeTruthy();

    const pendingResponse = await request.get(`${backendOrigin}/api/v1/admin/pending-users`, {
      headers: { Authorization: `Bearer ${fixture.admin.token}` },
    });
    expect(pendingResponse.ok()).toBeTruthy();
    const pendingData = await pendingResponse.json();
    expect((pendingData.users as Array<any>).some((u) => u.id === fixture.pending_user.user_id)).toBeFalsy();
  });

  test("dashboard autologin loads roster and device management", async ({ page, request }) => {
    const fixture = await bootstrapData(request, "dashboard-autologin");
    const params = new URLSearchParams({
      e2e_token: fixture.alice.token,
      e2e_autologin: "true",
      e2e_user_id: fixture.alice.user_id,
      e2e_org_id: fixture.alice.org_id,
      e2e_device_id: fixture.alice.device_id,
      e2e_email: fixture.alice.email,
    });

    await page.goto(`/?${params.toString()}`);
    await expect(page.locator("#contact-search")).toBeVisible();
    await expect(page.locator(".contact-item")).toHaveCount(3);

    await page.click("#admin-btn");
    await page.click("#admin-nav-users");
    await page.click(`#info-${fixture.alice.user_id}`);
    await expect(page.locator(".admin-detail-header")).toContainText("alice");
    // "Alice Desktop" is what we mocked as the device name in backend tests
    await expect(page.locator(".admin-detail-body")).toContainText("Alice Desktop");
  });

  test("chat layout supports sidebar drawer, resize persistence, and multiline composer shortcuts", async ({ page, request }) => {
    const fixture = await bootstrapData(request, "dashboard-autologin");
    const params = new URLSearchParams({
      e2e_token: fixture.alice.token,
      e2e_autologin: "true",
      e2e_user_id: fixture.alice.user_id,
      e2e_org_id: fixture.alice.org_id,
      e2e_device_id: fixture.alice.device_id,
      e2e_email: fixture.alice.email,
    });

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`/?${params.toString()}`);
    await expect(page.locator("#contact-search")).toBeVisible();

    const sidebar = page.locator(".sidebar").first();
    const resizer = page.locator("#sidebar-resizer");
    await expect(resizer).toBeVisible();

    const sidebarWidthBefore = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
    const handleBox = await resizer.boundingBox();
    if (!handleBox) throw new Error("Sidebar resize handle is not visible.");

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2);
    await page.mouse.up();

    const sidebarWidthAfter = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
    expect(sidebarWidthAfter).toBeGreaterThan(sidebarWidthBefore);

    const storedSidebarWidth = await page.evaluate(() =>
      Number(window.localStorage.getItem("trustline.sidebar.width")),
    );
    expect(storedSidebarWidth).toBeGreaterThanOrEqual(220);
    expect(storedSidebarWidth).toBeLessThanOrEqual(420);

    await page.reload();
    await expect(page.locator("#contact-search")).toBeVisible();
    const sidebarWidthReloaded = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
    expect(Math.abs(sidebarWidthReloaded - storedSidebarWidth)).toBeLessThan(40);

    await page.setViewportSize({ width: 820, height: 860 });
    await expect(page.locator("#sidebar-toggle-btn")).toBeVisible();
    await expect(page.locator(".app-body")).not.toHaveClass(/sidebar-open/);

    await page.click("#sidebar-toggle-btn");
    await expect(page.locator(".app-body")).toHaveClass(/sidebar-open/);
    await expect(page.locator("#sidebar-backdrop")).toBeVisible();
    await page.click("#sidebar-backdrop");
    await expect(page.locator(".app-body")).not.toHaveClass(/sidebar-open/);

    await page.click("#sidebar-toggle-btn");
    await page.locator(".contact-item").first().click();
    await expect(page.locator(".app-body")).not.toHaveClass(/sidebar-open/);
    await expect(page.locator("#message-input")).toBeVisible();

    const composer = page.locator("#message-input");
    await composer.fill("Short");
    const singleLineHeight = await composer.evaluate((element) => (element as HTMLTextAreaElement).clientHeight);
    await composer.press("Shift+Enter");
    await composer.type("Second line");
    const twoLineHeight = await composer.evaluate((element) => (element as HTMLTextAreaElement).clientHeight);
    expect(twoLineHeight).toBeGreaterThan(singleLineHeight);

    await composer.fill(Array.from({ length: 35 }, (_, index) => `Line ${index + 1}`).join("\n"));
    const cappedHeight = await composer.evaluate((element) => (element as HTMLTextAreaElement).clientHeight);
    expect(cappedHeight).toBeLessThanOrEqual(150);

    await composer.fill("Line one");
    await composer.press("Shift+Enter");
    await composer.type("Line two");
    const withNewline = await composer.inputValue();
    expect(withNewline).toContain("\n");

    await composer.press("Enter");
    const afterEnter = await composer.inputValue();
    expect(afterEnter.endsWith("\n")).toBeFalsy();
  });

  test("admin tables use horizontal overflow containers on narrow windows", async ({ page, request }) => {
    const fixture = await bootstrapData(request, "admin-approve");
    const params = new URLSearchParams({
      e2e_token: fixture.admin.token,
      e2e_autologin: "true",
      e2e_user_id: fixture.admin.user_id,
      e2e_org_id: fixture.admin.org_id,
      e2e_device_id: fixture.admin.device_id,
      e2e_email: fixture.admin.email,
    });

    await page.setViewportSize({ width: 620, height: 860 });
    await page.goto(`/?${params.toString()}`);
    await page.click("#admin-btn");

    const scrollContainer = page.locator(".admin-table-scroll").first();
    await expect(scrollContainer).toBeVisible();

    const overflow = await scrollContainer.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  });

  test("backend websocket protocol: delivery, receipts, typing, offline replay, revocation and tenant isolation", async ({ request }) => {
    const fixture = await bootstrapData(request, "ws-protocol");

    const aliceWs = await connectWs(fixture.alice.token, fixture.alice.device_id);
    let bobWs = await connectWs(fixture.bob.token, fixture.bob.device_id);

    const ciphertext = Buffer.from("hello world", "utf8").toString("base64");
    aliceWs.send(JSON.stringify({
      type: "MESSAGE_SEND",
      payload: {
        recipient_device_id: fixture.bob.device_id,
        ciphertext,
        ephemeral_public_key: "ephemeral-key",
        header: { dh_public: Array(32).fill(0), prev_counter: 0, msg_counter: 0 },
      },
    }));

    const received = await waitForJsonMessage(bobWs, (msg) => msg.type === "MESSAGE_RECEIVE");
    expect(received.payload.ciphertext).toBe(ciphertext);
    expect(received.payload.sender_device_id).toBe(fixture.alice.device_id);

    bobWs.send(JSON.stringify({
      type: "MESSAGE_ACK",
      payload: { message_id: received.payload.message_id },
    }));
    const delivered = await waitForJsonMessage(
      aliceWs,
      (msg) => msg.type === "MESSAGE_STATUS" && msg.payload.status === "delivered"
    );
    expect(delivered.payload.message_id).toBe(received.payload.message_id);

    bobWs.send(JSON.stringify({
      type: "MESSAGE_READ",
      payload: { message_id: received.payload.message_id },
    }));
    const read = await waitForJsonMessage(
      aliceWs,
      (msg) => msg.type === "MESSAGE_STATUS" && msg.payload.status === "read"
    );
    expect(read.payload.message_id).toBe(received.payload.message_id);

    aliceWs.send(JSON.stringify({
      type: "TYPING_EVENT",
      payload: { recipient_device_id: fixture.bob.device_id, is_typing: true },
    }));
    const typing = await waitForJsonMessage(
      bobWs,
      (msg) => msg.type === "TYPING_EVENT" && msg.payload.is_typing === true
    );
    expect(typing.payload.sender_user_id).toBe(fixture.alice.user_id);

    bobWs.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const offlineCiphertext = Buffer.from("offline message", "utf8").toString("base64");
    aliceWs.send(JSON.stringify({
      type: "MESSAGE_SEND",
      payload: {
        recipient_device_id: fixture.bob.device_id,
        ciphertext: offlineCiphertext,
        ephemeral_public_key: null,
        header: { dh_public: Array(32).fill(1), prev_counter: 0, msg_counter: 1 },
      },
    }));

    bobWs = await connectWs(fixture.bob.token, fixture.bob.device_id);
    const replay = await waitForJsonMessage(
      bobWs,
      (msg) => msg.type === "MESSAGE_RECEIVE" && msg.payload.ciphertext === offlineCiphertext
    );
    expect(replay.payload.sender_device_id).toBe(fixture.alice.device_id);

    const revokeResponse = await request.post(`${backendOrigin}/api/v1/admin/revoke-device`, {
      headers: { Authorization: `Bearer ${fixture.admin.token}` },
      data: { device_id: fixture.bob.device_id },
    });
    expect(revokeResponse.ok()).toBeTruthy();

    const revoked = await waitForJsonMessage(
      bobWs,
      (msg) => msg.type === "DEVICE_REVOKED" && msg.payload.device_id === fixture.bob.device_id
    );
    expect(revoked.payload.device_id).toBe(fixture.bob.device_id);

    const crossTenantResponse = await request.get(
      `${backendOrigin}/api/v1/keys/${fixture.outsider.user_id}`,
      { headers: { Authorization: `Bearer ${fixture.alice.token}` } }
    );
    expect(crossTenantResponse.status()).toBe(403);

    aliceWs.close();
    bobWs.close();
  });
});
