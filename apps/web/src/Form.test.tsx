import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordForm } from "./Form";
afterEach(cleanup);
describe("record forms", () => {
  it("submits numeric values and omits empty optional fields", async () => {
    const submit = vi.fn(async () => {});
    render(
      <RecordForm
        fields={[
          { key: "amount", type: "number" },
          { key: "notes", optional: true },
        ]}
        onSubmit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ amount: 12.5 }));
  });
  it("keeps the user's input when the server rejects a change", async () => {
    render(
      <RecordForm
        fields={[{ key: "name" }]}
        onSubmit={async () => {
          throw new Error("Duplicate name");
        }}
      />,
    );
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Operations" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Duplicate name"));
    expect(input.value).toBe("Operations");
  });
  it("sends invoice line items as validated numbers", async () => {
    const submit = vi.fn(async () => {});
    render(<RecordForm fields={[{ key: "items", type: "items" }]} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText("Item 1 description"), {
      target: { value: "Consulting" },
    });
    fireEvent.change(screen.getByLabelText("Item 1 quantity"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Item 1 unit price"), { target: { value: "10.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        items: [{ description: "Consulting", quantity: 3, unitPrice: 10.25 }],
      }),
    );
  });
});
