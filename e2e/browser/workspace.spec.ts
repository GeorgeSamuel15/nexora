import { test, expect } from "@playwright/test";
test("owner registers through the browser and records attendance", async ({ page }) => {
  const id=Date.now();
  await page.goto("/register");
  await page.getByLabel("Organization Name").fill(`Browser acceptance ${id}`);
  await page.getByLabel("First Name").fill("Acceptance");
  await page.getByLabel("Last Name").fill("Owner");
  await page.getByLabel("Email",{exact:true}).fill(`browser-${id}@nexora.test`);
  await page.getByLabel("Password",{exact:true}).fill("Acceptance-password-2026!");
  await page.getByRole("button",{name:"Continue"}).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("link",{name:"My attendance",exact:true}).click();
  await page.getByRole("button",{name:"Clock in",exact:true}).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button",{name:"Clock out",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const cookies=await page.context().cookies();
  expect(cookies.find(c=>c.name==="nexora_refresh")?.httpOnly).toBe(true);
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
test("mobile sign-in has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/login");
  await expect(page.getByRole("heading",{name:"Welcome back."})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
