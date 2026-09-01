/**
 * @file design-audit-page.tsx
 * @description Dev-only page to compare Pledge and Agreement certificates side-by-side.
 * Shows all states, buttons, inputs for visual consistency review.
 * Route: /tree/design-audit
 */

import { useState } from 'react';
import { ProfileCertificate } from '@/app/components/profile/profile-certificate';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { Button } from '@/components/ui/button';

const MOCK = {
  creator: 'Vyacheslav Ladischenski',
  partner: 'Opa Mukaaaa',
  signedAt: '2026-03-06T12:00:00Z',
  partnerSignedAt: '2026-03-06T14:00:00Z',
  terms: 'Scope: Professional partnership — all work-related communication.\nRequest channel: Clarity session requests will happen via email.\nFrequency: At least 1 clarity live session(s) per month unless confirmed to skip by both parties.\nSession duration: Minimum 15 minutes per /live session.\nResponse time: Session requests must be acknowledged within 5 days.',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 mt-12 first:mt-0">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b border-border pb-2">
        {children}
      </h2>
    </div>
  );
}

function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">{label}</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {children}
      </div>
    </div>
  );
}

function CertificateColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-center text-gray-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

export function DesignAuditPage() {
  const [termsValue, setTermsValue] = useState(MOCK.terms);
  const [partnerName, setPartnerName] = useState('');

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Design Audit: Certificates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Side-by-side comparison of Pledge and Agreement certificates in all states.
            Review typography, spacing, colors, buttons, and inputs for consistency.
          </p>
        </div>

        {/* ─── SECTION 1: Active/Signed certificates side by side ─── */}
        <SectionLabel>1. Signed / Active — Core Certificates</SectionLabel>
        <CompareRow label="The two certificates as a user sees them">
          <CertificateColumn title="CLARITY PLEDGE (signed)">
            <ProfileCertificate
              name={MOCK.creator}
              signedAt={MOCK.signedAt}
              role="CEO"
              linkedinUrl="https://linkedin.com/in/ladischenski"
              avatarColor="#002B5C"
              showQrCode={false}
            />
          </CertificateColumn>
          <CertificateColumn title="CLARITY PARTNER AGREEMENT (active)">
            <AgreementCertificate
              variant="active"
              creatorName={MOCK.creator}
              creatorSignedAt={MOCK.signedAt}
              partnerName={MOCK.partner}
              partnerSignedAt={MOCK.partnerSignedAt}
              termsText={MOCK.terms}
            />
          </CertificateColumn>
        </CompareRow>

        {/* ─── SECTION 2: Agreement States ─── */}
        <SectionLabel>2. Agreement States</SectionLabel>

        <CompareRow label="Creation (form) — the certificate IS the form">
          <CertificateColumn title="CREATION MODE">
            <AgreementCertificate
              variant="creation"
              creatorName={MOCK.creator}
              partnerNameValue={partnerName}
              onPartnerNameChange={setPartnerName}
              partnerNamePlaceholder="their name"
              termsText={termsValue}
              onTermsChange={setTermsValue}
            />
          </CertificateColumn>
          <CertificateColumn title="CREATION — name locked (existing user found)">
            <AgreementCertificate
              variant="creation"
              creatorName={MOCK.creator}
              partnerNameValue="Jane Smith"
              onPartnerNameChange={() => {}}
              partnerNameReadOnly
              partnerNamePlaceholder="their name"
              termsText={MOCK.terms}
              onTermsChange={() => {}}
            />
          </CertificateColumn>
        </CompareRow>

        <CompareRow label="Pending — waiting for partner to sign">
          <CertificateColumn title="PENDING (partner view)">
            <AgreementCertificate
              variant="pending"
              creatorName={MOCK.creator}
              creatorSignedAt={MOCK.signedAt}
              partnerName={MOCK.partner}
              termsText={MOCK.terms}
            />
          </CertificateColumn>
          <CertificateColumn title="PENDING (creator view — same certificate)">
            <AgreementCertificate
              variant="pending"
              creatorName={MOCK.creator}
              creatorSignedAt={MOCK.signedAt}
              partnerName={MOCK.partner}
              termsText={MOCK.terms}
            />
          </CertificateColumn>
        </CompareRow>

        <CompareRow label="Celebration — just signed, confetti moment">
          <CertificateColumn title="CELEBRATION">
            <AgreementCertificate
              variant="celebration"
              creatorName={MOCK.creator}
              creatorSignedAt={MOCK.signedAt}
              partnerName={MOCK.partner}
              partnerSignedAt={MOCK.partnerSignedAt}
              termsText={MOCK.terms}
            />
          </CertificateColumn>
          <CertificateColumn title="ACTIVE (same visuals, for comparison)">
            <AgreementCertificate
              variant="active"
              creatorName={MOCK.creator}
              creatorSignedAt={MOCK.signedAt}
              partnerName={MOCK.partner}
              partnerSignedAt={MOCK.partnerSignedAt}
              termsText={MOCK.terms}
            />
          </CertificateColumn>
        </CompareRow>

        {/* ─── SECTION 3: Buttons & CTAs ─── */}
        <SectionLabel>3. Buttons & CTAs Used Across Both Flows</SectionLabel>

        <div className="bg-white rounded-lg p-6 shadow-sm border space-y-6">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Agreement Page CTAs</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button className="min-h-11 px-8">Review &amp; Sign</Button>
              <Button variant="outline" className="min-h-11 px-6 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                Terminate Agreement
              </Button>
              <Button variant="outline" className="min-h-11">Resend Invitation</Button>
              <span className="text-[#0044CC] hover:underline font-medium text-sm cursor-pointer">
                Ready to practice? Start a /live session &rarr;
              </span>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Pledge Page CTAs</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button className="min-h-11 px-8 bg-[#0044CC] hover:bg-[#0033AA]">Accept This Pledge</Button>
              <Button variant="outline" className="min-h-11">Share</Button>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#0A66C2] bg-[#0A66C2]/10 rounded cursor-pointer">
                LinkedIn
              </span>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Form Inputs (Agreement Creation)</p>
            <div className="bg-[#FDFBF7] p-4 rounded-lg border space-y-4" style={{ border: '2px solid #002B5C' }}>
              <div>
                <p className="text-xs text-gray-500 mb-1">Partner name input (empty)</p>
                <input
                  type="text"
                  placeholder="their name"
                  className="border-0 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 text-base font-semibold border-b-2 border-[#1A1A1A]/20 focus-visible:border-[#0044CC] min-w-[200px] placeholder:text-[#1A1A1A]/30 placeholder:font-normal"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Partner name input (error)</p>
                <input
                  type="text"
                  value="ab"
                  readOnly
                  className="border-0 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 text-base font-semibold border-b-2 border-red-500 min-w-[200px]"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                />
                <p className="text-sm text-red-500 mt-1">Name must be at least 3 characters</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Partner name input (locked — existing user)</p>
                <input
                  type="text"
                  value="Jane Smith"
                  readOnly
                  className="border-0 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 text-base font-semibold border-b-2 border-[#1A1A1A]/20 cursor-default bg-[#F5F1E8]/50 min-w-[200px]"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Terms textarea</p>
                <textarea
                  rows={3}
                  value="Scope: Professional partnership..."
                  readOnly
                  className="w-full resize-y bg-[#F5F1E8] border-0 border-b text-sm leading-relaxed text-[#1A1A1A]/80 border-[#1A1A1A]/20 focus-visible:outline-none min-h-[80px] font-sans"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── SECTION 4: Typography Comparison ─── */}
        <SectionLabel>4. Typography Side-by-Side</SectionLabel>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">PLEDGE (current)</p>
              <div className="space-y-3 bg-[#FDFBF7] p-4 rounded">
                <h2 className="text-3xl md:text-4xl tracking-wide text-[#1A1A1A]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  The Clarity Pledge
                </h2>
                <p className="text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">A personal commitment to clarity</p>
                <p className="text-lg leading-relaxed text-[#1A1A1A]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  I, <span className="font-bold">Vyacheslav Ladischenski</span>, hereby commit to everyone...
                </p>
                <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] tracking-wide">YOUR RIGHT</h4>
                <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A]">When we speak, if you need to know...</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">AGREEMENT (current)</p>
              <div className="space-y-3 bg-[#FDFBF7] p-4 rounded">
                <h2 className="text-2xl md:text-3xl tracking-wide text-[#1A1A1A]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  Clarity Partner Agreement
                </h2>
                <p className="text-[10px] md:text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">A mutual commitment to clarity</p>
                <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  We, <span className="font-semibold">Vyacheslav Ladischenski</span> and <span className="font-semibold">Opa Mukaaaa</span>, agree to:
                </p>
                <h3 className="text-base md:text-lg font-bold text-[#0044CC] tracking-wide uppercase">Your Right</h3>
                <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A]">When we speak, if either of us needs to know...</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <a href="/tree" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Developer Pages
          </a>
        </div>
      </div>
    </div>
  );
}
