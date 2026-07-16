import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Approval request email. The client approves or rejects with one click — no
 * login. The two buttons are signed links to /api/approve/<token>?d=approve|reject.
 *
 * Light-theme, hardcoded hex (email clients can't use CSS variables); values
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
  danger: "#dc2626",
} as const;

export interface ApprovalRequestEmailProps {
  brandName: string;
  requesterName: string;
  caption: string;
  imageUrl?: string;
  scheduledLabel?: string;
  approveUrl: string;
  rejectUrl: string;
}

export function ApprovalRequestEmail({
  brandName,
  requesterName,
  caption,
  imageUrl,
  scheduledLabel,
  approveUrl,
  rejectUrl,
}: ApprovalRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {requesterName} needs your approval on a {brandName} post
      </Preview>
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
              style={{ fontSize: "20px", fontWeight: 700, color: COLORS.text1, margin: "0 0 8px" }}
            >
              A post is ready for your approval
            </Heading>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: COLORS.text2,
                margin: "0 0 20px",
              }}
            >
              {requesterName} at {brandName} would like your sign-off.
              {scheduledLabel ? ` Scheduled for ${scheduledLabel}.` : ""}
            </Text>

            {imageUrl && (
              <Img
                src={imageUrl}
                alt="Post preview"
                width="456"
                style={{
                  borderRadius: "12px",
                  marginBottom: "16px",
                  width: "100%",
                  height: "auto",
                }}
              />
            )}

            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: COLORS.text1,
                backgroundColor: COLORS.bg,
                borderRadius: "10px",
                padding: "14px",
                margin: "0 0 24px",
                whiteSpace: "pre-wrap",
              }}
            >
              {caption}
            </Text>

            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tr>
                <td style={{ paddingRight: "10px" }}>
                  <Button
                    href={approveUrl}
                    style={{
                      backgroundColor: COLORS.success,
                      color: COLORS.accentFg,
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "12px 22px",
                      borderRadius: "10px",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    Approve
                  </Button>
                </td>
                <td>
                  <Button
                    href={rejectUrl}
                    style={{
                      backgroundColor: COLORS.surface,
                      color: COLORS.danger,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "11px 22px",
                      borderRadius: "10px",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    Request changes
                  </Button>
                </td>
              </tr>
            </table>

            <Hr style={{ borderColor: COLORS.border, margin: "28px 0 16px" }} />
            <Text style={{ fontSize: "13px", lineHeight: "1.5", color: COLORS.text2, margin: 0 }}>
              No account needed — approving or requesting changes takes one click. This link is
              unique to this post and stops working once you decide.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ApprovalRequestEmail;
