import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Weekly report digest. Sent to a client (no login) with the fresh AI narrative
 * and headline numbers, plus a button to the full white-label report.
 *
 * Light-theme, hardcoded hex (email clients can't use CSS variables) — values
 * copied from tokens.css, kept in sync with the other templates.
 */

const COLORS = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  border: "#e4e4e7",
  text1: "#17171c",
  text2: "#6b6b76",
  accent: "#4f46e5",
  accentFg: "#ffffff",
  success: "#16a34a",
} as const;

export interface DigestEmailProps {
  reportTitle: string;
  periodLabel: string;
  summary: string;
  recommendations: Array<{ text: string; reason: string }>;
  stats: Array<{ label: string; value: string }>;
  reportUrl: string;
}

export function DigestEmail({
  reportTitle,
  periodLabel,
  summary,
  recommendations,
  stats,
  reportUrl,
}: DigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {reportTitle} — {periodLabel}
      </Preview>
      <Body
        style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, Arial, sans-serif", margin: 0 }}
      >
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 20px" }}>
          <Section
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "16px",
              padding: "32px",
            }}
          >
            <Text
              style={{ fontSize: "18px", fontWeight: 700, color: COLORS.text1, margin: "0 0 24px" }}
            >
              Signal
            </Text>

            <Heading
              style={{ fontSize: "20px", fontWeight: 700, color: COLORS.text1, margin: "0 0 4px" }}
            >
              {reportTitle}
            </Heading>
            <Text style={{ fontSize: "14px", color: COLORS.text2, margin: "0 0 20px" }}>
              {periodLabel}
            </Text>

            {stats.length > 0 && (
              <Section style={{ margin: "0 0 20px" }}>
                {stats.map((s) => (
                  <Text
                    key={s.label}
                    style={{ fontSize: "14px", color: COLORS.text1, margin: "0 0 6px" }}
                  >
                    <strong>{s.value}</strong>{" "}
                    <span style={{ color: COLORS.text2 }}>{s.label}</span>
                  </Text>
                ))}
              </Section>
            )}

            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.6",
                color: COLORS.text1,
                borderLeft: `3px solid ${COLORS.accent}`,
                paddingLeft: "14px",
                margin: "0 0 22px",
              }}
            >
              {summary}
            </Text>

            {recommendations.length > 0 && (
              <Section style={{ margin: "0 0 24px" }}>
                <Text
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: COLORS.text1,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: "0 0 10px",
                  }}
                >
                  Recommendations
                </Text>
                {recommendations.map((r, i) => (
                  <Section
                    key={i}
                    style={{
                      backgroundColor: COLORS.bg,
                      borderRadius: "10px",
                      padding: "12px 14px",
                      margin: "0 0 8px",
                    }}
                  >
                    <Text
                      style={{ fontSize: "14px", fontWeight: 600, color: COLORS.text1, margin: 0 }}
                    >
                      {r.text}
                    </Text>
                    <Text style={{ fontSize: "13px", color: COLORS.text2, margin: "4px 0 0" }}>
                      {r.reason}
                    </Text>
                  </Section>
                ))}
              </Section>
            )}

            <Button
              href={reportUrl}
              style={{
                backgroundColor: COLORS.accent,
                color: COLORS.accentFg,
                fontSize: "15px",
                fontWeight: 600,
                padding: "12px 22px",
                borderRadius: "10px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              View full report
            </Button>

            <Hr style={{ borderColor: COLORS.border, margin: "28px 0 16px" }} />

            <Text style={{ fontSize: "12px", lineHeight: "1.5", color: COLORS.text2, margin: 0 }}>
              You&rsquo;re receiving this because your account manager set up a weekly digest. The
              numbers and narrative are generated fresh from the latest data each week.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;
