import xentralLogo from '../../assets/icons/Xentral.png'
import './brand-logo.css'

function BrandLogo({ text = 'entral-ACMS', size = 'sm' }) {
  const classes = `brand-logo ${size === 'lg' ? 'brand-logo-lg' : ''}`.trim()

  return (
    <span className={classes}>
      <span className="brand-logo-icon">
        <img src={xentralLogo} alt="Xentral logo" />
      </span>
      <span className="brand-logo-text">{text}</span>
    </span>
  )
}

export default BrandLogo
