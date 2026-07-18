import { LegalDoc } from "@/components/layout/legal-doc";

export const metadata = {
  title: "Terms of Service — Signal",
  description: "The terms that govern your use of Signal.",
};

// Public-facing legal contact, policy date and governing jurisdiction. Swap
// CONTACT_EMAIL to a domain address once Signal has one; keep GOVERNING_LAW in
// sync with where the business is legally established.
const CONTACT_EMAIL = "markravencanete50@gmail.com";
const EFFECTIVE_DATE = "18 July 2026";
const GOVERNING_LAW = "the Philippines";

/**
 * Public terms of service (`/terms`). Required alongside the privacy policy for
 * Meta App Review and reachable signed-out (see the proxy matcher).
 */
export default function TermsOfServicePage() {
  return (
    <LegalDoc title="Terms of Service" updated={EFFECTIVE_DATE}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Signal
        (&ldquo;Signal&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using
        the service, you agree to these Terms. If you are using Signal on behalf of an organisation,
        you agree on its behalf and confirm you have authority to do so.
      </p>

      <h2>The service</h2>
      <p>
        Signal is a social media management tool for publishing to, analysing and managing connected
        Facebook Pages and Instagram Business accounts, with optional AI-assisted suggestions. We
        may add, change or remove features over time.
      </p>

      <h2>Accounts and eligibility</h2>
      <p>
        You must be at least 18 years old to use Signal. You are responsible for the activity under
        your account and for keeping your credentials secure. Notify us promptly of any unauthorised
        use.
      </p>

      <h2>Connecting social accounts</h2>
      <p>
        When you connect a Facebook Page or Instagram Business account, you authorise Signal to
        perform the actions you request on your behalf through the Meta platform APIs — such as
        publishing posts, reading metrics and managing comments. You represent that you have the
        right to manage each account you connect, and you agree to comply with the terms and
        policies of the relevant platform, including the{" "}
        <a href="https://www.facebook.com/legal/terms" target="_blank" rel="noopener noreferrer">
          Facebook Terms
        </a>{" "}
        and the{" "}
        <a
          href="https://help.instagram.com/581066165581870"
          target="_blank"
          rel="noopener noreferrer"
        >
          Instagram Terms
        </a>
        . Signal is not affiliated with, endorsed by or sponsored by Meta.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to use Signal to:</p>
      <ul>
        <li>publish spam, or content that is unlawful, infringing, deceptive or harmful;</li>
        <li>violate the terms, policies or rate limits of any connected platform;</li>
        <li>
          access or attempt to access data you are not authorised to, or interfere with the security
          or operation of the service;
        </li>
        <li>resell or provide the service to third parties except as expressly permitted.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You retain all rights to the content you create, upload or publish through Signal. You grant
        us a limited licence to host, process and transmit that content solely to operate the
        service and to carry out the actions you request — for example, storing your media so a
        platform can fetch it, and publishing your posts to your connected accounts. You are
        responsible for the content you publish and for ensuring you have the rights to use it.
      </p>

      <h2>AI features</h2>
      <p>
        Where enabled, Signal offers AI-generated suggestions. These are provided to assist you and
        may be inaccurate or incomplete. You are responsible for reviewing and deciding what to
        publish; suggestions are not professional advice.
      </p>

      <h2>Billing</h2>
      <p>
        Signal offers a free plan and paid plans. Paid subscriptions are billed in advance through
        our payment processor and renew automatically until cancelled. You can cancel at any time,
        and cancellation takes effect at the end of the current billing period. Except where
        required by law, fees already paid are non-refundable.
      </p>

      <h2>Third-party services</h2>
      <p>
        Signal relies on third-party services (including Meta, and our hosting, media, payment,
        email and AI providers). We are not responsible for their availability, changes or acts, and
        your use of a connected platform remains subject to that platform&rsquo;s own terms.
      </p>

      <h2>Disclaimers</h2>
      <p>
        Signal is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
        any kind, whether express or implied, including fitness for a particular purpose and
        non-infringement. We do not warrant that the service will be uninterrupted, error-free or
        secure, or that any platform metric or publishing action will always succeed.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Signal will not be liable for any indirect,
        incidental, special, consequential or punitive damages, or any loss of profits, revenue,
        data or goodwill. Our total liability arising out of or relating to the service will not
        exceed the amount you paid us in the twelve months before the event giving rise to the
        claim.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using Signal and delete your account at any time. We may suspend or terminate
        access if you breach these Terms or if required to protect the service or comply with law.
        On termination, your right to use the service ends; sections that by their nature should
        survive (such as content licence terms already exercised, disclaimers and limitations of
        liability) will survive.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. When we make material changes we will revise
        the &ldquo;Last updated&rdquo; date and take reasonable steps to notify you. Continued use
        after changes take effect constitutes acceptance.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of {GOVERNING_LAW}, without regard to conflict-of-laws
        rules. The courts of {GOVERNING_LAW} have exclusive jurisdiction over any dispute, except
        where applicable law gives you the right to bring a claim elsewhere.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalDoc>
  );
}
