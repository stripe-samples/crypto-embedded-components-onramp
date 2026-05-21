# Crypto Embedded Components Onramp Examples

Sample apps demonstrating the [Stripe Embedded Components Onramp](https://docs.stripe.com/crypto/onramp/embedded-components) integration across different platforms.

## Examples

| Directory | Platform | Description |
|-----------|----------|-------------|
| [`react-native-expo/`](react-native-expo/) | React Native (Expo) | Full crypto purchase flow using `@stripe/stripe-react-native` — authentication, KYC, wallet registration, and checkout |
| [`react-web/`](react-web/) | React (Web) | Full crypto purchase flow using `@stripe/crypto` — authentication, KYC, wallet registration, and checkout |

## Prerequisites

- A Stripe account with Embedded Components onramp access ([request access](https://docs.stripe.com/crypto/onramp#submit-your-application))
- OAuth client ID and secret (provisioned by Stripe during onboarding)

Each example has its own README with platform-specific setup instructions.

## Related Documentation

- [Embedded Components Onramp Integration Guide](https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide)
- [Stripe React Native SDK](https://github.com/stripe/stripe-react-native)
- [iOS Sample App](https://github.com/stripe/stripe-ios/tree/master/Example/CryptoOnramp%20Example)
- [Android Sample App](https://github.com/stripe/stripe-android/tree/master/crypto-onramp-example)

## License

Licensed under the [MIT License](LICENSE).
