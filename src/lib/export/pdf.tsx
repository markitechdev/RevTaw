import "server-only";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { ExportBlock, ExportDocument, InlineRun } from "@/lib/export/model";

/**
 * PDF export (spec §34): the document model laid out with the standard
 * Helvetica fonts (no font files needed), real page breaks and a footer with
 * page numbers.
 */

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.45, color: "#0f172a" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", lineHeight: 1.25, marginBottom: 6 },
  subtitle: { fontSize: 12, color: "#475569", marginBottom: 4 },
  meta: { fontSize: 8.5, color: "#475569", marginBottom: 6 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: "#0f172a", marginBottom: 16 },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  paragraph: { marginBottom: 6 },
  muted: { color: "#475569", fontSize: 9.5 },
  listItem: { flexDirection: "row", marginBottom: 2 },
  bullet: { width: 14 },
  childItem: { flexDirection: "row", marginLeft: 14, marginBottom: 1 },
  table: { marginBottom: 10, borderWidth: 0.5, borderColor: "#cbd5e1" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1" },
  headerRow: { backgroundColor: "#f1f5f9" },
  cell: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, fontSize: 9.5 },
  headerCell: { fontFamily: "Helvetica-Bold" },
  keyValues: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  keyValue: { width: "33%", paddingRight: 8, marginBottom: 6 },
  keyLabel: { fontSize: 7.5, color: "#475569", textTransform: "uppercase" },
  keyValueText: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  callout: { borderLeftWidth: 2, borderLeftColor: "#4f46e5", backgroundColor: "#f8fafc", paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 },
  calloutLabel: { fontSize: 7.5, color: "#4f46e5", fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 1 },
  code: { fontFamily: "Courier", fontSize: 9, backgroundColor: "#f1f5f9", padding: 6, marginBottom: 8 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#64748b", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 4 },
});

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <Text>
      {runs.map((run, index) => (
        <Text key={index} style={{ fontFamily: run.code ? "Courier" : run.bold && run.italic ? "Helvetica-BoldOblique" : run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica" }}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

function Block({ block }: { block: ExportBlock }): ReactElement | null {
  switch (block.type) {
    case "heading":
      return <Text style={block.level === 2 ? styles.h2 : styles.h3}>{block.text}</Text>;
    case "paragraph":
      return (
        <View style={[styles.paragraph, block.muted ? styles.muted : {}]}>
          <Runs runs={block.runs} />
        </View>
      );
    case "list":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.items.map((item, index) => (
            <View key={index}>
              <View style={styles.listItem}>
                <Text style={styles.bullet}>{block.ordered ? `${index + 1}.` : "•"}</Text>
                <View style={{ flex: 1 }}>
                  <Runs runs={item.runs} />
                </View>
              </View>
              {item.children.map((child, childIndex) => (
                <View key={childIndex} style={styles.childItem}>
                  <Text style={styles.bullet}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Runs runs={child} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            {block.columns.map((column, index) => (
              <Text key={index} style={[styles.cell, styles.headerCell]}>
                {column}
              </Text>
            ))}
          </View>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row} wrap={false}>
              {row.map((value, cellIndex) => (
                <Text key={cellIndex} style={styles.cell}>
                  {value}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "keyValues":
      return (
        <View style={styles.keyValues}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.keyValue}>
              <Text style={styles.keyLabel}>{item.label}</Text>
              <Text style={styles.keyValueText}>{item.value}</Text>
            </View>
          ))}
        </View>
      );
    case "callout":
      return (
        <View style={styles.callout}>
          <Text style={styles.calloutLabel}>{block.label}</Text>
          <Runs runs={block.runs} />
        </View>
      );
    case "code":
      return <Text style={styles.code}>{block.text}</Text>;
    case "pageBreak":
      return <View break />;
  }
}

function PdfDocument({ document }: { document: ExportDocument }) {
  return (
    <Document title={document.title} author="RevTaw" creator="RevTaw" producer="RevTaw">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{document.title}</Text>
        {document.subtitle && <Text style={styles.subtitle}>{document.subtitle}</Text>}
        {document.meta.length > 0 && <Text style={styles.meta}>{document.meta.join("   ·   ")}</Text>}
        <View style={styles.rule} />
        {document.sections.map((section, index) => (
          <View key={index}>
            {section.heading && (
              <Text style={styles.h1} minPresenceAhead={60}>
                {section.heading}
              </Text>
            )}
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} />
            ))}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>{document.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `RevTaw · page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(document: ExportDocument): Promise<Buffer> {
  return renderToBuffer(<PdfDocument document={document} />);
}
