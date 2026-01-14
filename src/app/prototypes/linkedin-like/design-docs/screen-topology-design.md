# Screen: Topology

## Purpose
Network visualization showing who verified whom on which ideas.

## Layout (Mobile 375px)

### Header (sticky)
- Back arrow
- "Understanding Network" title
- Info button → Toggle legend

### Legend (collapsible)
- Node size explanation
- Edge colors explanation
- Cross-disagreement highlight

### Filter Bar
- Dropdown to filter by idea
- "All ideas" default
- Truncated idea text in options

### Network Visualization Card
- SVG viewBox 350x400
- Circular node layout
- Edges between verified pairs
- Blue edges for cross-disagreement
- Gray edges for same-position

### Stats Row (3-col grid)
- People count
- Verifications count
- Cross-Disagreement count (highlighted)

### Selected Node Panel (conditional)
- Appears when node tapped
- Avatar, name, role
- "View Profile" link
- Listener score + verification count
- List of connected verifications

### Bottom Nav (fixed)

## Components
- [x] NetworkGraph: SVG-based visualization
- [x] Node: Clickable circle with avatar
- [x] Edge: Line between nodes
- [x] StatCard: Value with label
- [x] NodeDetailPanel: Expandable info

## Interactions
- Tap node → Select/deselect, show panel
- Tap edge → (future) Navigate to idea
- Tap "View Profile" → Navigate to /profile/:id
- Tap verification item → Navigate to /idea/:id
- Select idea filter → Filter edges to that idea
- Tap info → Toggle legend

## Mock Data Needed
- mockUsers + currentUser: All nodes
- mockCertifications: All edges
- getIdeaById: For labels

## Personality Expression
- LinkedIn-style network visualization
- Clean SVG rendering
- Professional color palette
- Blue highlight for cross-disagreement
- Node size reflects reputation
- Interactive exploration
- Filter by context (idea)
