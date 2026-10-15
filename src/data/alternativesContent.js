import { reviewedAlternativesContent } from './reviewedAlternativesContent'
import { accessibleAlternativesContent } from './accessibleAlternativesContent'

// The featured comparisons have checked sources and can be indexed. Older
// shared URLs remain accessible with careful, noindex editorial content.
const alternativesContent = {
  ...reviewedAlternativesContent,
  ...accessibleAlternativesContent,
}

export default alternativesContent
export const alternativeSlugs = Object.keys(alternativesContent)
export const reviewedAlternativeSlugs = Object.keys(reviewedAlternativesContent)
