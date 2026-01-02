import React from 'react';
import styled from 'styled-components';
import Section from '../ui/Section';

const Wrap = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const Card = styled.div`
  border-radius: var(--border-radius-2xl);
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.02);
  padding: 28px;
  display: grid;
  gap: 14px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: 0;
  }

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const Label = styled.div`
  color: var(--color-muted);
  font-size: var(--font-size-sm);
`;

const Value = styled.a`
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
`;

export default function ContactPage() {
  return (
    <Section
      title="Contatti"
      subtitle="Sostituisci i link con quelli reali."
    >
      <Wrap>
        <Card>
          <Row>
            <Label>Email</Label>
            <Value href="mailto:foto@portfolio.com">foto@portfolio.com</Value>
          </Row>
          <Row>
            <Label>Instagram</Label>
            <Value href="https://instagram.com" target="_blank" rel="noreferrer">@username</Value>
          </Row>
          <Row>
            <Label>Stampe / Collaborazioni</Label>
            <Value href="mailto:foto@portfolio.com?subject=Portfolio%20-%20Info">Scrivimi</Value>
          </Row>
        </Card>
      </Wrap>
    </Section>
  );
}
