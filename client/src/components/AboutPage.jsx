import './AboutPage.css';

export default function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-section">
        <h2>What is Energy Archipelago?</h2>
        <p>
          Energy Archipelago is a living map and database of community energy organisations
          and projects — the people-powered side of the renewable energy transition. It exists
          to plug a long-standing data gap: community energy groups are easy to overlook next to
          utility-scale generation, so there has never been a straightforward way to see how many
          of them exist, what they've built, and how much capacity they represent.
        </p>
        <p>
          The name and concept revive the original Energy Archipelago, launched in Scotland in
          2012. It started by cataloguing 97 Scottish community energy projects, grew to cover
          around 400 across the UK, and eventually expanded internationally with partners in
          Australia, the Netherlands and Sweden — tracking over 2,000 community energy projects
          at its peak. It combined interactive mapping, crowdsourced data entry, and statistics
          tools to support researchers, policymakers and practitioners, before being retired in
          2018 due to resource constraints.
        </p>
        <p>
          This version rebuilds that idea for today: a map of pins that aggregates into regional
          and national polygons as you zoom out, so anyone — from a single community group to a
          national policy team — can see the shape of the sector at whatever level they need.
        </p>
      </section>

      <section className="about-section">
        <h2>Project lead: Scene</h2>
        <p>
          Energy Archipelago is led by <a href="https://www.scene.community" target="_blank" rel="noreferrer">Scene</a>,
          a social enterprise for local energy futures. Scene supports the low-carbon transition by
          promoting community energy innovation and ownership, through research, consultancy and
          product development — helping local communities participate in, and benefit from, the
          shift to renewable and low-carbon energy.
        </p>
      </section>

      <section className="about-section">
        <h2>Project creator: Sandy Robinson</h2>
        <div className="about-person">
          <img
            src="/Sandy-robinson.png"
            alt="Sandy Robinson"
            className="about-person-photo"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div>
            <p>
              Sandy Robinson is Co-Director at Scene, where he specialises in community energy and
              energy access research and project development. He leads Scene's UK community energy
              research programme — including the annual <em>Community Energy: State of the Sector</em>
              {' '}report — alongside Scene's contributions to off-grid energy access research, and
              manages Scene's role in REFRUIT, a multi-partner smart agritech project in
              Sub-Saharan Africa. Energy Archipelago grew directly out of that research work: a
              recurring need for a shared, evidence-based picture of the sector that didn't depend
              on any one organisation's private spreadsheet.
            </p>
            <p>
              He has eight years' experience in the UK renewable energy sector, managing and
              supporting a diverse portfolio of community-led low-carbon projects — from wind
              energy to innovative low-carbon heat networks — and has worked on international
              energy access and off-grid energy, including in humanitarian settings. His
              background is in climate change, with a specialism in community-led, participatory
              approaches to mitigation and adaptation. He holds an MSc in Climate Change &amp;
              International Development from the University of East Anglia.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2>Partner organisations</h2>
        <p>
          Energy Archipelago grows through partnerships with community energy networks, research
          institutions and public bodies who can contribute data, local knowledge, or reach into
          regions and technologies the map doesn't yet cover well. Partnering gives your
          organisation a direct line to shaping a shared, open evidence base for the sector —
          rather than everyone maintaining their own disconnected spreadsheets.
        </p>
        <a className="about-contact-btn" href="mailto:sandy.r@scene.community?subject=Energy%20Archipelago%20partnership">
          Get in touch about partnering
        </a>
      </section>
    </div>
  );
}
