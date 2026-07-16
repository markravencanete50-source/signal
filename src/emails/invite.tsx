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

import { ROLE_LABEL, type Role } from "@/types";

/**
 * Workspace invite email.
 *
 * Email clients are a hostile rendering target: no CSS variables, no external
 * stylesheets, patchy flexbox. So this is the one place the design tokens can't
 * be used and hex values are unavoidable — the values below are copied from
 * tokens.css (light theme) and must be updated alongside it.
 *
 * Light-theme only by design: `prefers-color-scheme` support is inconsistent
 * across clients, and a half-applied dark theme reads worse than a consistent
 * light one.
 */

const COLORS = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  border: "#e4e4e7",
  text1: "#17171c",
  text2: "#6b6b76",
  accent: "#4f46e5",
  accentFg: "#ffffff",
  accentSoft: "#eef2ff",
} as const;

export interface InviteEmailProps {
  inviterName: string;
  workspaceName: string;
  role: Role;
  acceptUrl: string;
}

/** Plain-English description of what the invited role can actually do. */
const ROLE_BLURB: Record<Role, string> = {
  owner: "full access, including billing and team management",
  admin: "manage brands, connections and the team",
  editor: "create, schedule and publish content",
  client: "review and approve posts, and view reports — read-only otherwise",
};

export function InviteEmail({ inviterName, workspaceName, role, acceptUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      {/* Shown in the inbox list next to the subject — worth writing properly. */}
      <Preview>
        {inviterName} invited you to {workspaceName} on Signal
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
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: COLORS.text1,
                margin: "0 0 24px",
                letterSpacing: "-0.02em",
              }}
            >
              Signal
            </Text>

            <Heading
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: COLORS.text1,
                margin: "0 0 12px",
                letterSpacing: "-0.02em",
              }}
            >
              {inviterName} invited you to {workspaceName}
            </Heading>

            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.5",
                color: COLORS.text2,
                margin: "0 0 24px",
              }}
            >
              You&rsquo;ve been added as{" "}
              <strong style={{ color: COLORS.text1 }}>{ROLE_LABEL[role]}</strong> —{" "}
              {ROLE_BLURB[role]}.
            </Text>

            <Button
              href={acceptUrl}
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
              Accept invitation
            </Button>

            <Hr style={{ borderColor: COLORS.border, margin: "28px 0 16px" }} />

            <Text style={{ fontSize: "13px", lineHeight: "1.5", color: COLORS.text2, margin: 0 }}>
              This link expires in 7 days and can only be used once. If you weren&rsquo;t expecting
              this invitation you can safely ignore it — nothing will be shared with you.
            </Text>
          </Section>

          <Text
            style={{
              fontSize: "12px",
              color: COLORS.text2,
              textAlign: "center",
              margin: "20px 0 0",
            }}
          >
            Signal — social performance, decoded
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;
