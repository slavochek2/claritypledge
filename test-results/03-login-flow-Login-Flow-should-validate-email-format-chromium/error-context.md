# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e6]:
      - link "Clarity Pledge" [ref=e7] [cursor=pointer]:
        - /url: /
      - generic [ref=e8]:
        - link "Manifesto" [ref=e9] [cursor=pointer]:
          - /url: /article
        - link "Clarity Champions" [ref=e10] [cursor=pointer]:
          - /url: /clarity-champions
        - link "Services" [ref=e11] [cursor=pointer]:
          - /url: /our-services
      - generic [ref=e12]:
        - link "Log In" [ref=e13] [cursor=pointer]:
          - /url: /login
        - link "Take the Pledge" [ref=e14] [cursor=pointer]:
          - /url: /sign-pledge
  - main [ref=e15]:
    - generic [ref=e17]:
      - heading "Welcome Back" [level=1] [ref=e18]
      - paragraph [ref=e19]: Enter your email to access your pledge profile
      - generic [ref=e20]:
        - generic [ref=e22]:
          - text: Email Address
          - textbox "Email Address" [ref=e23]:
            - /placeholder: your@email.com
            - text: not-an-email
          - generic [ref=e24]:
            - img [ref=e25]
            - paragraph [ref=e27]: Please enter a valid email address
        - button "Send Me a Magic Link" [active] [ref=e28] [cursor=pointer]
        - button "Don't have a pledge? Sign now" [ref=e30] [cursor=pointer]
```