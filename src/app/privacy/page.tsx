import { LegalDoc } from "@/components/layout/legal-doc";

export const metadata = {
  title: "Privacy Policy — Signal",
  description: "How Signal collects, uses, stores and deletes your data.",
};

// Public-facing legal contact + policy date. Update the date whenever the policy
// materially changes. Swap CONTACT_EMAIL to a domain address once Signal has one.
const CONTACT_EMAIL = "markravencanete50@gmail.com";
const EFFECTIVE_DATE = "18 July 2026";

/**
 * Public privacy policy (`/privacy`). Required by Meta App Review and reachable
 * signed-out (see the proxy matcher). The content mirrors what the app actually
 * does — connections, aggregated metrics, media, AI — so it stays honest.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated={EFFECTIVE_DATE}>
      <p>
        Signal (&ldquo;Signal&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a social media
        management tool that agencies and teams use to publish to, analyse and manage their
        connected Facebook Pages and Instagram Business accounts. This policy explains what we
        collect, why, how we store it, and how you can have it deleted.
      </p>
      <p>
        Signal is a business-to-business product used by agencies to manage brands on behalf of
        their clients. Where an agency connects a social account and manages it through Signal, that
        agency is the controller of the resulting data and Signal acts as its processor. If you are
        a client of an agency using Signal, please also refer to that agency&rsquo;s own privacy
        notice.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> When you sign up we store your name and email address
          through our authentication provider so you can sign in and be identified within a
          workspace.
        </li>
        <li>
          <strong>Connected social accounts.</strong> When you connect a Facebook Page or Instagram
          Business account using Facebook Login for Business, we store the access token you grant
          (encrypted at rest — see Security), the connected Page or Instagram account&rsquo;s id and
          name, and the app-scoped user id of the person who authorised the connection. The token is
          used only to perform the actions you ask Signal to take.
        </li>
        <li>
          <strong>Content you create.</strong> Post captions, drafts, scheduled posts, and any
          images or video you upload for publishing. Media is stored with our media host so that the
          social platform can fetch it at publish time.
        </li>
        <li>
          <strong>Performance data.</strong> Aggregated metrics we retrieve from the social
          platforms for the accounts you connect — such as reach, impressions, engagement, saves and
          follower counts. We store these aggregates and discard the raw platform API responses once
          they have been processed.
        </li>
        <li>
          <strong>Engagement.</strong> Comments on your connected accounts, retrieved so you can
          read and reply to them from within Signal.
        </li>
        <li>
          <strong>Billing.</strong> If you upgrade to a paid plan, payments are handled by our
          payment processor. We store the resulting customer and subscription identifiers and your
          plan status. We never see or store full card numbers.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To publish and schedule the posts you create to the accounts you have connected.</li>
        <li>To show you analytics and reporting for those accounts.</li>
        <li>To bring comments into one place so you can respond to them.</li>
        <li>
          To generate optional AI suggestions (for example, caption ideas and the reasoning behind a
          recommendation). Post text may be sent to our AI providers for this purpose; it is not
          used to train third-party models.
        </li>
        <li>To operate, secure and support the service, and to process billing.</li>
      </ul>

      <h2>How we share your information</h2>
      <p>
        We do not sell your personal data. We share it only with the service providers that make
        Signal work, each acting as our processor under contract:
      </p>
      <ul>
        <li>
          <strong>Meta (Facebook &amp; Instagram)</strong> — to publish content and retrieve metrics
          and comments for the accounts you connect.
        </li>
        <li>
          <strong>Google Firebase</strong> — authentication, database and infrastructure.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
        <li>
          <strong>Cloudinary</strong> — storage and delivery of the media you upload.
        </li>
        <li>
          <strong>Stripe</strong> — payment processing for paid plans.
        </li>
        <li>
          <strong>Resend</strong> — transactional email (invitations, approvals, digests), where
          enabled.
        </li>
        <li>
          <strong>Groq and OpenRouter</strong> — AI suggestion features, where enabled.
        </li>
      </ul>
      <p>
        We may also disclose information where required by law, or to protect the rights, safety and
        security of Signal, our users or the public.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep your access tokens only for as long as the connection is active. When you disconnect
        an account, or when Meta notifies us that you have removed Signal from your Meta account, we
        delete the associated token and stop all publishing and syncing for it. Aggregated metrics
        are retained so that historical trends and reports remain available to the workspace; they
        are not personal to any individual. You may request deletion at any time (see below).
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can disconnect any account from Signal at any time from the Connections settings, which
        removes its stored token immediately. To remove Signal from Meta&rsquo;s side, go to your
        Facebook settings &rarr; Apps and Websites, and remove Signal. When you do, Meta sends us a
        deletion request automatically; we remove the connection(s) associated with your Meta
        account and record the outcome under a confirmation code you can view on our public status
        page.
      </p>
      <p>
        To request deletion of any other data we hold about you, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete
        your personal data, and to object to or restrict certain processing. To exercise any of
        these, contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
        respond as required by applicable law.
      </p>

      <h2>Compliance with platform terms</h2>
      <p>
        Signal&rsquo;s use of information received from the Meta platforms adheres to the{" "}
        <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer">
          Meta Platform Terms
        </a>{" "}
        and Developer Policies, including their limited-use requirements. We request only the
        permissions needed for the features described above, and we use the data obtained through
        each permission solely to provide those features.
      </p>

      <h2>Security</h2>
      <p>
        Connection tokens are encrypted at rest using AES-256-GCM and are never exposed to a
        browser. Data is transmitted over encrypted connections, and access to production data is
        restricted. No system is perfectly secure, but we take reasonable measures appropriate to
        the sensitivity of the data we hold.
      </p>

      <h2>Children</h2>
      <p>
        Signal is a business tool not directed to children. We do not knowingly collect personal
        data from anyone under 18. If you believe a child has provided us data, contact us and we
        will delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we will revise the &ldquo;Last
        updated&rdquo; date above and, for material changes, take reasonable steps to notify you.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalDoc>
  );
}
