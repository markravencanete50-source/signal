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
 * Publish-failure email. Sent to brand admins after a post exhausts its retries.
 *
 * Light-theme, hardcoded hex (email clients can't use CSS variables) — values
 * copied from tokens.css, kept in sync with `invite.tsx`.
 */

const COLORS = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  border: "#e4e4e7",
  text1: "#17171c",
  text2: "#6b6b76",
  danger: "#dc2626",
  dangerSoft: "#fdeded",
  accent: "#4f46e5",
  accentFg: "#ffffff",
} as const;

export interface PublishFailedEmailProps {
  brandName: string;
  postSummary: string;
  error: string;
  attempts: number;
  plannerUrl: string;
}

export function PublishFailedEmail({
  brandName,
  postSummary,
  error,
  attempts,
  plannerUrl,
}: PublishFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>A scheduled post for {brandName} failed to publish</Preview>
      <Body
        style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, Arial, sans-serif", margin: 0 }}
      >
        <Container style={{ maxWidth: "520px", margin: "0 auto", padding: "40px 20px" }}>
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
              style={{ fontSize: "20px", fontWeight: 700, color: COLORS.text1, margin: "0 0 12px" }}
            >
              A post for {brandName} didn&rsquo;t publish
            </Heading>

            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.5",
                color: COLORS.text2,
                margin: "0 0 16px",
              }}
            >
              We tried {attempts} time{attempts === 1 ? "" : "s"} and couldn&rsquo;t get it out.
              It&rsquo;s been moved to <strong style={{ color: COLORS.text1 }}>Failed</strong> so
              nothing publishes unexpectedly later.
            </Text>

            <Text
              style={{
                fontSize: "14px",
                color: COLORS.text1,
                backgroundColor: COLORS.bg,
                borderRadius: "8px",
                padding: "12px 14px",
                margin: "0 0 8px",
              }}
            >
              {postSummary}
            </Text>

            <Text
              style={{
                fontSize: "13px",
                color: COLORS.danger,
                backgroundColor: COLORS.dangerSoft,
                borderRadius: "8px",
                padding: "10px 14px",
                margin: "0 0 24px",
              }}
            >
              {error}
            </Text>

            <Button
              href={plannerUrl}
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
              Review in Planner
            </Button>

            <Hr style={{ borderColor: COLORS.border, margin: "28px 0 16px" }} />

            <Text style={{ fontSize: "13px", lineHeight: "1.5", color: COLORS.text2, margin: 0 }}>
              Common causes: an expired connection (reconnect it in Settings), or media that
              doesn&rsquo;t meet the platform&rsquo;s specs. Re-scheduling from the Planner will try
              again.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PublishFailedEmail;
