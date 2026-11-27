import "server-only";

// PRD §11.3, ADR-001 §3.6: customer text and chat messages are data, wrapped in an XML-style tag.
// Escaping &, < and > stops the customer from closing the tag early or opening a fake instruction tag.
export function wrapCustomerText(tag: string, text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<${tag}>${escaped}</${tag}>`;
}
