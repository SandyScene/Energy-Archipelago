import './AboutPage.css';

const CONTACT_HREF = 'mailto:sandy.r@scene.community?subject=Energy%20Archipelago%20partnership';

// Populate as partner organisations join — each gets a logo tile in the Partners section below.
const PARTNERS = [];

function ContactButton({ className = 'about-contact-btn' }) {
  return (
    <a className={className} href={CONTACT_HREF}>
      Get in touch about partnering
    </a>
  );
}

export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-content">
        <section className="about-hero">
          <a href="https://www.scene.community" target="_blank" rel="noreferrer" className="about-hero-scene-link">
            <img
              src="/Scene-logo.png"
              alt="Scene"
              className="about-hero-scene-logo"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </a>
          <h1>Energy Archipelago</h1>
          <p>
            Energy Archipelago is a living map and database of community energy organisations and
            projects — the people-powered side of the renewable energy transition. Pins aggregate
            into regional and national polygons as you zoom out, so anyone can see the shape of the
            sector at whatever level they need, from a single project to a national overview.
          </p>
          <p>
            The map grows through partnerships with community energy networks, research institutions
            and public bodies who can contribute data, local knowledge, or reach into regions and
            technologies we don't yet cover well. If your organisation wants to help shape a shared,
            open evidence base for the sector, we'd love to talk.
          </p>
          <ContactButton className="about-contact-btn about-contact-btn-hero" />
        </section>

        <section className="about-section">
          <h2>History of Energy Archipelago</h2>
          <p>
            The name and concept revive the original Energy Archipelago, launched in Scotland in
            2012. It started by cataloguing 97 Scottish community energy projects, grew to cover
            around 400 across the UK, and eventually expanded internationally with partners in
            Australia, the Netherlands and Sweden — tracking over 2,000 community energy projects
            at its peak. It combined interactive mapping, crowdsourced data entry, and statistics
            tools to support researchers, policymakers and practitioners, before being retired in
            2018 due to resource constraints. This version rebuilds that idea for today.
          </p>
        </section>

        <section className="about-section">
          <h2>About Scene</h2>
          <div className="about-org">
            <a href="https://www.scene.community" target="_blank" rel="noreferrer" className="about-org-logo-link">
              <img
                src="/Scene-logo.png"
                alt="Scene"
                className="about-org-logo"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </a>
            <p>
              <a href="https://www.scene.community" target="_blank" rel="noreferrer">Scene</a> is a
              social enterprise for local energy futures. Scene supports the low-carbon transition by
              promoting community energy innovation and ownership, through research, consultancy and
              product development — helping local communities participate in, and benefit from, the
              shift to renewable and low-carbon energy. Scene leads Energy Archipelago and is actively
              seeking partner organisations to help grow and govern it.
            </p>
          </div>
        </section>

        <section className="about-section">
          <h2>Partners</h2>
          <p>
            Energy Archipelago is a partnership project. Organisations that join will have their
            logo featured here alongside Scene.
          </p>
          <div className="about-partners-grid">
            {PARTNERS.length > 0
              ? PARTNERS.map((partner) => (
                  <a
                    key={partner.name}
                    href={partner.href}
                    target="_blank"
                    rel="noreferrer"
                    className="about-partner-logo"
                  >
                    <img src={partner.logo} alt={partner.name} />
                  </a>
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="about-partner-slot" aria-hidden="true" />
                ))}
          </div>
        </section>

        <section className="about-section">
          <h2>Project lead: Sandy Robinson</h2>
          <div className="about-person">
            <img
              src="/Sandy-robinson.png"
              alt="Sandy Robinson"
              className="about-person-photo"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <p>
              Sandy Robinson is Co-Director at Scene, where he leads the UK community energy
              research programme, including the annual <em>Community Energy: State of the Sector</em>
              {' '}report. He has eight years' experience in the UK renewable energy sector and holds
              an MSc in Climate Change &amp; International Development from the University of East
              Anglia. Energy Archipelago grew directly out of his research work — a recurring need
              for a shared, evidence-based picture of the sector.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
