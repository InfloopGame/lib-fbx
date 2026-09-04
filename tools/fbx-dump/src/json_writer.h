#pragma once

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <ostream>
#include <string>

class JsonWriter {
public:
    explicit JsonWriter(std::ostream& out, bool compact)
        : out_(out), compact_(compact) {}

    void beginObject() { begin('{', '}'); }
    void endObject() { end(); }
    void beginArray() { begin('[', ']'); }
    void endArray() { end(); }

    JsonWriter& key(const char* k) {
        comma();
        indentLine();
        writeEscaped(k);
        out_ << (compact_ ? ":" : ": ");
        needComma_ = false;
        afterKey_ = true;
        return *this;
    }

    void nullValue() { rawValue(); out_ << "null"; }
    void value(bool v) { rawValue(); out_ << (v ? "true" : "false"); }
    void value(int v) { rawValue(); out_ << v; }
    void value(unsigned v) { rawValue(); out_ << v; }
    void value(long long v) { rawValue(); out_ << v; }
    void value(unsigned long long v) { rawValue(); out_ << v; }
    void value(double v) {
        rawValue();
        if (!std::isfinite(v)) {
            out_ << "null";
            return;
        }
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.17g", v);
        out_ << buf;
    }
    void value(const char* s) {
        rawValue();
        if (!s) {
            out_ << "null";
            return;
        }
        writeEscaped(s);
    }
    void value(const std::string& s) { value(s.c_str()); }

    void rawValueStart() { rawValue(); }

private:
    std::ostream& out_;
    bool compact_;
    bool needComma_ = false;
    bool afterKey_ = false;
    int indent_ = 0;
    std::string closers_;

    void comma() {
        if (needComma_) out_ << ',';
        needComma_ = true;
    }

    void indentLine() {
        if (compact_ || afterKey_) return;
        out_ << '\n';
        for (int i = 0; i < indent_; ++i) out_ << "  ";
    }

    void begin(char open, char close) {
        rawValue();
        out_ << open;
        closers_.push_back(close);
        indent_++;
        needComma_ = false;
        afterKey_ = false;
    }

    void end() {
        indent_--;
        char close = closers_.back();
        closers_.pop_back();
        if (needComma_ && !compact_) {
            out_ << '\n';
            for (int i = 0; i < indent_; ++i) out_ << "  ";
        }
        out_ << close;
        needComma_ = true;
        afterKey_ = false;
    }

    void rawValue() {
        if (!afterKey_) {
            comma();
            indentLine();
        }
        afterKey_ = false;
        needComma_ = true;
    }

    void writeEscaped(const char* s) {
        out_ << '"';
        for (const unsigned char* p = reinterpret_cast<const unsigned char*>(s); *p; ++p) {
            switch (*p) {
            case '"': out_ << "\\\""; break;
            case '\\': out_ << "\\\\"; break;
            case '\b': out_ << "\\b"; break;
            case '\f': out_ << "\\f"; break;
            case '\n': out_ << "\\n"; break;
            case '\r': out_ << "\\r"; break;
            case '\t': out_ << "\\t"; break;
            default:
                if (*p < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", *p);
                    out_ << buf;
                } else {
                    out_ << *p;
                }
            }
        }
        out_ << '"';
    }
};
